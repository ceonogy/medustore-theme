import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import {
  mapGoshipStatus,
  verifyGoshipRequest,
  type GoshipWebhookPayload,
} from "../../../modules/goship/webhook"

/**
 * Webhook GoShip — `POST /webhooks/goship` (public, chạy sau proxy).
 *
 * Flow:
 *  1. Verify `x-goship-hmac-sha256 = base64(HMAC_SHA256(rawBody, GOSHIP_CLIENT_SECRET))`
 *     trên **raw body** (matcher preserveRawBody trong middlewares.ts) — sai
 *     chữ ký → 401, không đụng DB.
 *  2. Dedup bằng bảng `goship_shipment_event` (UNIQUE gcode+status+update_time).
 *     Trùng → trả 200 ngay (GoShip retry tối đa ~3 lần/3 phút).
 *  3. Dò fulfillment theo `data.goship_id` (gcode) — cập nhật mốc
 *     `shipped_at`/`delivered_at`/`canceled_at` để `order.fulfillment_status`
 *     (vốn được TÍNH LẠI, không lưu cột) đổi theo.
 *  4. Ghi sự kiện vào timeline để hiển thị ở trang tài khoản.
 *
 * Luôn trả `{ success: true }` (trừ lỗi xác thực/JSON) để GoShip không retry
 * vô hạn khi ta không dò được fulfillment.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as Logger
  const secret = process.env.GOSHIP_CLIENT_SECRET

  const raw = (req as unknown as { rawBody?: Buffer }).rawBody
  if (!raw || !Buffer.isBuffer(raw)) {
    logger.warn("[goship] webhook: thiếu raw body (preserveRawBody chưa bật?) — từ chối.")
    return res.status(400).json({ success: false, message: "Raw body required" })
  }

  const signature = req.headers["x-goship-hmac-sha256"] as string | undefined
  if (!verifyGoshipRequest(raw, signature, secret)) {
    logger.warn(
      `[goship] webhook: xác thực thất bại (secret=${secret ? "set" : "unset"}, ` +
        `header=${signature ? "có" : "thiếu"}) — trả 401.`,
    )
    return res.status(401).json({ success: false, message: "Invalid signature" })
  }

  let payload: GoshipWebhookPayload
  try {
    payload = JSON.parse(raw.toString("utf8")) as GoshipWebhookPayload
  } catch {
    return res.status(400).json({ success: false, message: "Invalid JSON" })
  }

  const gcode = String(payload.gcode ?? "")
  if (!gcode) {
    return res.status(400).json({ success: false, message: "Missing gcode" })
  }

  const goship = req.scope.resolve("goship") as {
    recordShipmentEvent(
      p: GoshipWebhookPayload,
      fulfillmentId?: string | null,
    ): Promise<{ duplicate: boolean; id?: string }>
  }
  const fulfillmentService = req.scope.resolve(Modules.FULFILLMENT)

  // ── Dò fulfillment theo gcode (data.goship_id) ───────────────────────
  let fulfillment:
    | {
        id: string
        data?: Record<string, unknown> | null
        shipped_at?: Date | null
        delivered_at?: Date | null
        canceled_at?: Date | null
        labels?: { id: string; tracking_number?: string | null; tracking_url?: string | null }[] | null
      }
    | undefined
  try {
    const candidates = await fulfillmentService.listFulfillments(
      {},
      { select: ["id", "data", "shipped_at", "delivered_at", "canceled_at"] },
    )
    const match = candidates.find(
      (f) => String((f.data as Record<string, unknown> | null)?.goship_id ?? "") === gcode,
    )
    if (match) {
      // Lấy kèm labels (quan hệ) để cập nhật mã vận đơn hiển thị.
      fulfillment = await fulfillmentService.retrieveFulfillment(match.id, {
        relations: ["labels"],
      })
    }
  } catch (err) {
    logger.warn(`[goship] webhook: không đọc được fulfillment — ${(err as Error).message}`)
  }

  // ── Dedup: ghi sự kiện (route vẫn 200 dù trùng) ──────────────────────
  const event = await goship.recordShipmentEvent(payload, fulfillment?.id ?? null)
  if (event.duplicate) {
    logger.info(`[goship] webhook: sự kiện ${gcode}/${payload.status} đã xử lý — bỏ qua.`)
    return res.json({ success: true, duplicate: true })
  }

  if (!fulfillment) {
    logger.warn(
      `[goship] webhook: không tìm thấy fulfillment cho gcode=${gcode} (order_id=${payload.order_id ?? "-"}) — chỉ ghi log.`,
    )
    return res.json({ success: true, matched: false })
  }

  // ── Cập nhật mốc thời gian + data + label ────────────────────────────
  const mapping = mapGoshipStatus(payload.status)
  const now = new Date()
  const update: Record<string, unknown> = {
    data: {
      ...(fulfillment.data ?? {}),
      goship_status: payload.status ?? null,
      goship_status_text: payload.status_text ?? null,
      goship_carrier_short_name: payload.carrier_short_name ?? null,
      ...(payload.tracking_url ? { goship_tracking_url: payload.tracking_url } : {}),
      ...(payload.code ? { goship_carrier_code: payload.code } : {}),
      goship_updated_at: now.toISOString(),
    },
  }
  if (mapping.shipped && !fulfillment.shipped_at) update.shipped_at = now
  if (mapping.delivered && !fulfillment.delivered_at) update.delivered_at = now
  if (mapping.canceled && !fulfillment.canceled_at) update.canceled_at = now

  const labels = fulfillment.labels ?? []
  if (labels.length) {
    update.labels = labels.map((label) => ({
      id: label.id,
      tracking_number: payload.code ? String(payload.code) : (label.tracking_number ?? ""),
      tracking_url: payload.tracking_url ? String(payload.tracking_url) : (label.tracking_url ?? ""),
    }))
  }

  try {
    await fulfillmentService.updateFulfillment(fulfillment.id, update as never)
    logger.info(
      `[goship] webhook: fulfillment ${fulfillment.id} (gcode ${gcode}) → ` +
        `${payload.status} ${payload.status_text ?? ""} (phase=${mapping.phase}).`,
    )
  } catch (err) {
    logger.error(`[goship] webhook: cập nhật fulfillment lỗi — ${(err as Error).message}`)
    // Sự kiện đã ghi; trả 200 để GoShip không retry (admin xem log xử lý tay).
    return res.json({ success: true, matched: true, updated: false })
  }

  return res.json({ success: true, matched: true, phase: mapping.phase })
}
