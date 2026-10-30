import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
  PaymentWebhookEvents,
} from "@medusajs/framework/utils"
import type { Logger, WebhookActionData } from "@medusajs/framework/types"
import {
  verifySePayRequest,
  type SePayWebhookPayload,
} from "../../../modules/sepay/webhook"

/**
 * Webhook SePay — `POST /webhooks/sepay` (public, chạy sau OLS).
 *
 * Flow (đúng khuyến nghị của SePay, anti-replay + idempotent):
 *  1. Verify HMAC-SHA256 `sha256=HMAC(secret, "${timestamp}.${rawBody}")`
 *     trên **raw body** (matcher trong middlewares.ts bật preserveRawBody) —
 *     sai/chữ ký cũ → 401, không đụng DB.
 *  2. Dedup theo `id` của giao dịch: đã xử lý rồi → trả `{"success":true}`
 *     ngay (SePay retry tối đa ~7 lần trong 33 phút — phải trả 200).
 *  3. Delegate cho payment provider qua `payment.getWebhookActionAndData`
 *     (`provider: "sepay"`) — provider tự verify lại lần 2, dò session theo
 *     va_number, đối chiếu số tiền rồi trả action.
 *  4. Action `captured` → phát event `payment.webhook_received` để
 *     subscriber của Medusa capture payment + cập nhật order
 *     (pending_authorization → paid). `provider` phải là "sepay" thuần —
 *     PaymentModuleService tự nối tiền tố `pp_`.
 *  5. Trả đúng `{"success": true}` trong < 30s.
 *
 * Bất kể hợp lệ hay không, mỗi delivery đều được ghi vào
 * `sepay_webhook_event` để đối soát (status: processed / amount_mismatch /
 * unmatched / out / invalid).
 */

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const hmacSecret = process.env.SEPAY_WEBHOOK_SECRET
  const apiKey = process.env.SEPAY_WEBHOOK_API_KEY

  // Raw body bắt buộc để verify HMAC — matcher preserveRawBody trong
  // middlewares.ts phải được bật cho route này.
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody
  if (!raw || !Buffer.isBuffer(raw)) {
    logger.warn("SePay webhook: thiếu raw body (preserveRawBody chưa bật?) — từ chối.")
    return res.status(400).json({ success: false, message: "Raw body required" })
  }

  // Chấp nhận HMAC-SHA256 **hoặc** API Key (form SePay chỉ cho chọn một
  // phương thức). Không cấu hình gì → từ chối.
  const verify = verifySePayRequest({
    rawBody: raw,
    headers: req.headers,
    hmacSecret,
    apiKey,
  })
  if (!verify.valid) {
    logger.warn(
      `SePay webhook: xác thực thất bại (${verify.reason}) — trả 401. ` +
        `hmac_secret=${hmacSecret ? "set" : "unset"} api_key=${apiKey ? "set" : "unset"}`,
    )
    return res.status(401).json({ success: false, message: "Invalid signature" })
  }
  const authVia = verify.via ?? "unknown"

  let payload: SePayWebhookPayload
  try {
    payload = JSON.parse(raw.toString("utf8")) as SePayWebhookPayload
  } catch {
    return res.status(400).json({ success: false, message: "Invalid JSON" })
  }

  const transactionId = payload.id === undefined || payload.id === null ? "" : String(payload.id)
  if (!transactionId) {
    return res.status(400).json({ success: false, message: "Missing transaction id" })
  }

  const sepay = req.scope.resolve("sepay")
  const baseRecord = {
    sepay_transaction_id: transactionId,
    gateway: payload.gateway ?? null,
    account_number: payload.accountNumber ?? null,
    sub_account: payload.subAccount ?? null,
    code: payload.code ?? null,
    transfer_type: payload.transferType ?? null,
    transfer_amount:
      typeof payload.transferAmount === "number" && Number.isFinite(payload.transferAmount)
        ? payload.transferAmount
        : null,
    content: payload.content ?? null,
    payload: payload as unknown as Record<string, unknown>,
  }

  // ── Dedup: đã xử lý transaction này rồi → trả 200 ngay ──────────────
  const existing = await sepay.listSePayWebhookEvents(
    { sepay_transaction_id: transactionId },
    { take: 1 },
  )
  if (existing?.length) {
    logger.info(`SePay webhook: transaction ${transactionId} đã xử lý trước đó — bỏ qua.`)
    return res.json({ success: true })
  }

  // ── Tiền ra (refund/chuyển đi) — chỉ đối soát, không capture ─────────
  if (String(payload.transferType ?? "").toLowerCase() === "out") {
    await sepay.recordWebhookEvent({ ...baseRecord, status: "out" })
    return res.json({ success: true })
  }

  // ── Delegate cho payment provider ────────────────────────────────────
  let action: string | undefined
  let actionData: WebhookActionData | undefined
  try {
    const payment = req.scope.resolve(Modules.PAYMENT)
    const result = await payment.getWebhookActionAndData({
      provider: "sepay",
      payload: { data: payload, rawData: raw, headers: req.headers },
    })
    action = result?.action
    actionData = result?.data
  } catch (err) {
    logger.error(`SePay webhook: lỗi xử lý provider — ${(err as Error).message}`)
  }

  if (action === "captured" && actionData?.session_id) {
    await sepay.recordWebhookEvent({
      ...baseRecord,
      status: "processed",
      session_id: actionData.session_id,
    })
    // PaymentModuleService.getWebhookActionAndData tự nối `pp_` vào provider
    // — truyền "sepay" thuần. `rawData` là Buffer raw để provider verify
    // lại lần 2 (Stripe pattern, fail-closed).
    req.scope.resolve(Modules.EVENT_BUS).emit({
      name: PaymentWebhookEvents.WebhookReceived,
      data: {
        provider: "sepay",
        payload: { data: payload, rawData: raw, headers: req.headers },
      },
    })
    logger.info(
      `SePay webhook (${authVia}): transaction ${transactionId} khớp session ${actionData.session_id} ` +
        `(${actionData.amount}₫) — đã phát ${PaymentWebhookEvents.WebhookReceived}.`,
    )
    return res.json({ success: true })
  }

  // Không khớp session / sai số tiền / thiếu dữ liệu → vẫn 200 + đối soát
  const event = await sepay.recordWebhookEvent({ ...baseRecord, status: "unmatched" })
  logger.warn(
    `SePay webhook (${authVia}): transaction ${transactionId} không được capture (action=${action ?? "none"}, ` +
      `va=${payload.subAccount ?? "-"}, code=${payload.code ?? "-"}) — đã ghi đối soát ${event.event?.id ?? ""}.`,
  )
  return res.json({ success: true })
}
