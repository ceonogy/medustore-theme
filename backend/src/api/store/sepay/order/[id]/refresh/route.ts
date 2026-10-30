import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { regenerateSepayVaWorkflow } from "../../../../../../workflows/sepay/regenerate-va"

/**
 * POST /store/sepay/order/:id/refresh
 *
 * Tái tạo **VA/QR SePay mới** khi VA cũ đã hết hạn (`sepay_expired_at` qua
 * khứ). VA theo đơn của SePay có hạn ~24h; hết hạn thì khách chuyển khoản vào
 * đó có thể không còn khớp. Endpoint này hủy VA cũ (best-effort) rồi tạo VA
 * mới cùng số tiền, cập nhật `payment_session.data` qua payment module.
 *
 * Bảo mật: giống `GET /store/sepay/order/:id` — order id (ULID) là chìa khoá,
 * không cần đăng nhập (đơn khách vãng lai). Không lộ token/secret.
 *
 * Idempotent theo hướng an toàn: nếu đã thu tiền, hoặc VA còn hạn, thì không
 * tạo gì mới (trả nguyên trạng) — tránh tạo VA rác khi khách bấm nhiều lần.
 */
const SEPAY_PROVIDER_ID = "pp_sepay"

/** `2026-10-31 05:41:32` (giờ VN) → epoch ms. Không TZ → coi là +07:00. */
const parseExpiry = (value: unknown): number | null => {
  if (typeof value !== "string" || !value) return null
  const iso = value.includes("T") ? value : value.replace(" ", "T")
  const withTz = /[+-]\d{2}:?\d{2}$|Z$/.test(iso) ? iso : `${iso}+07:00`
  const ms = Date.parse(withTz)
  return Number.isNaN(ms) ? null : ms
}

type SePaySessionData = Record<string, unknown>

const toPaymentResponse = (
  d: SePaySessionData,
  displayId: unknown,
  capturedAt: string | Date | null,
  collectionStatus: string | null,
) => ({
  provider_id: SEPAY_PROVIDER_ID,
  display_id: displayId ?? null,
  order_code: d.sepay_order_code ?? null,
  va_number: d.sepay_va_number ?? null,
  qr_code_url: d.sepay_qr_code_url ?? null,
  bank_name: d.sepay_bank_name ?? null,
  account_number: d.sepay_account_number ?? null,
  account_holder_name: d.sepay_va_holder_name ?? null,
  amount: d.amount ?? null,
  expires_at: d.sepay_expired_at ?? null,
  captured: Boolean(capturedAt) || collectionStatus === "completed",
  captured_at: capturedAt ? String(capturedAt) : null,
  collection_status: collectionStatus,
})

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderId = req.params.id
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.payments.provider_id",
      "payment_collections.payments.captured_at",
      "payment_collections.payment_sessions.id",
      "payment_collections.payment_sessions.provider_id",
      "payment_collections.payment_sessions.status",
      "payment_collections.payment_sessions.amount",
      "payment_collections.payment_sessions.currency_code",
      "payment_collections.payment_sessions.data",
    ],
    filters: { id: orderId },
  })

  const order = data?.[0]
  if (!order) {
    return res.status(404).json({ message: "Không tìm thấy đơn hàng." })
  }

  for (const collection of order.payment_collections ?? []) {
    if (!collection) continue
    const session = (collection.payment_sessions ?? []).find(
      (s) => s?.provider_id === SEPAY_PROVIDER_ID,
    )
    if (!session) continue

    const d = (session.data ?? {}) as SePaySessionData
    const payment = (collection.payments ?? []).find(
      (p) => p?.provider_id === SEPAY_PROVIDER_ID,
    )
    const capturedAt = payment?.captured_at ?? null
    const captured = Boolean(capturedAt) || collection.status === "completed"

    // Đã thu tiền → không đụng tới VA.
    if (captured) {
      return res.json({
        payment: toPaymentResponse(d, order.display_id, capturedAt, collection.status ?? null),
        regenerated: false,
        reason: "captured",
      })
    }

    // VA còn hạn → không tạo mới.
    const expiresAt = parseExpiry(d.sepay_expired_at)
    if (expiresAt && expiresAt > Date.now()) {
      return res.json({
        payment: toPaymentResponse(d, order.display_id, capturedAt, collection.status ?? null),
        regenerated: false,
        reason: "not_expired",
      })
    }

    // Tái tạo qua workflow → payment provider (cờ sepay_regenerate).
    try {
      const { result } = await regenerateSepayVaWorkflow(req.scope).run({
        input: {
          session_id: String(session.id),
          data: { ...d, sepay_regenerate: true },
          amount: Number(session.amount ?? d.amount ?? 0),
          currency_code: String(session.currency_code ?? "vnd").toLowerCase(),
        },
      })
      const nextData = ((result?.data ?? {}) as SePaySessionData)
      res.json({
        payment: toPaymentResponse(d, order.display_id, capturedAt, collection.status ?? null),
        regenerated: true,
        // VA cũ + VA mới để storefront hiển thị ngay, không cần gọi lại.
        previous: {
          va_number: d.sepay_va_number ?? null,
          expires_at: d.sepay_expired_at ?? null,
        },
        payment_updated: toPaymentResponse(
          nextData,
          order.display_id,
          capturedAt,
          collection.status ?? null,
        ),
      })
    } catch (err) {
      res.status(502).json({
        message:
          "Không tái tạo được mã thanh toán SePay. Vui lòng thử lại hoặc liên hệ hỗ trợ.",
        detail: (err as Error).message,
      })
    }
    return
  }

  return res.status(404).json({ message: "Đơn hàng không dùng SePay." })
}
