import {
  getLastFulfillmentStatus,
  getLastPaymentStatus,
} from "@medusajs/core-flows"
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "email",
  "currency_code",
  "total",
  "item_total",
  "shipping_total",
  "tax_total",
  "items.id",
  "items.quantity",
  "items.title",
  "items.variant_title",
  "items.thumbnail",
  "items.product_title",
  "items.total",
  // Needed to compute `fulfillment_status` (xem core-flows aggregate-status).
  "items.raw_quantity",
  "items.detail.raw_fulfilled_quantity",
  "shipping_address.*",
  "billing_address.*",
  // Payment + fulfillment sources for the computed statuses below.
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "payment_collections.status",
  "fulfillments.id",
  "fulfillments.data",
  "fulfillments.created_at",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
  "fulfillments.labels.label_url",
]

type RawFulfillment = {
  id: string
  data?: Record<string, unknown> | null
  created_at?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  canceled_at?: string | null
  labels?:
    | {
        tracking_number?: string | null
        tracking_url?: string | null
        label_url?: string | null
      }[]
    | null
}

type GoshipModule = {
  listShipmentTimeline(gcode: string): Promise<Array<Record<string, unknown>>>
}

/** Giai đoạn giao hàng suy ra từ mốc thời gian của fulfillment. */
const fulfillmentPhase = (f: RawFulfillment): string => {
  if (f.canceled_at) return "canceled"
  if (f.delivered_at) return "delivered"
  if (f.shipped_at) return "shipped"
  return "pending"
}

/**
 * GET /store/account/orders/:id — một đơn của khách đang đăng nhập.
 * 404 khi đơn không thuộc họ (khớp `customer_id` hoặc `email`).
 *
 * Kèm khối `shipping` tóm tắt vận đơn GoShip (mã vận đơn, hãng, hành trình)
 * để trang tài khoản hiển thị trạng thái giao hàng.
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) => {
  const actorId = req.auth_context?.actor_id
  if (!actorId) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: actorId },
  })
  const customer = customers[0]
  if (!customer?.email) {
    return res.status(404).json({ message: "Customer not found" })
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: {
      id: req.params.id,
      $or: [{ customer_id: customer.id }, { email: customer.email }],
    },
  })

  if (!orders.length) {
    return res.status(404).json({ message: "Order not found" })
  }

  const order = orders[0] as Record<string, unknown> & {
    fulfillments?: RawFulfillment[]
  }

  // `payment_status` / `fulfillment_status` không phải cột trong DB mà do
  // Medusa tính từ payment_collections + fulfillments. `query.graph` không
  // trả về chúng, nên ta tính thủ công bằng chính helper của core-flows để
  // khớp với Admin API.
  const paymentStatus = getLastPaymentStatus(order as never)
  const fulfillmentStatus = getLastFulfillmentStatus(order as never)

  // Gắn hành trình (timeline) từ bảng `goship_shipment_event` cho mỗi vận đơn.
  let goship: GoshipModule | undefined
  try {
    goship = req.scope.resolve<GoshipModule>("goship")
  } catch {
    goship = undefined
  }

  const fulfillments = (order.fulfillments ?? []).map((f) => {
    const data = (f.data ?? {}) as Record<string, unknown>
    const rate = (data.rate ?? {}) as Record<string, unknown>
    const gcode = data.goship_id ? String(data.goship_id) : null
    const label = (f.labels ?? [])[0]
    return {
      id: f.id,
      phase: fulfillmentPhase(f),
      gcode,
      tracking_number:
        label?.tracking_number ??
        (data.tracking_number as string | null) ??
        gcode ??
        null,
      tracking_url: label?.tracking_url ?? (data.goship_tracking_url as string | null) ?? null,
      label_url: label?.label_url ?? null,
      carrier: (data.goship_carrier as string | null) ?? (rate.carrier as string | null) ?? null,
      carrier_short_name:
        (data.goship_carrier_short_name as string | null) ??
        (rate.carrier_short_name as string | null) ??
        null,
      service: (rate.service as string | null) ?? null,
      expected: (rate.expected as string | null) ?? null,
      status: (data.goship_status as number | string | null) ?? null,
      status_text: (data.goship_status_text as string | null) ?? null,
      created_at: f.created_at ?? null,
      shipped_at: f.shipped_at ?? null,
      delivered_at: f.delivered_at ?? null,
      canceled_at: f.canceled_at ?? null,
    }
  })

  // Hành trình: ưu tiên vận đơn mới nhất có gcode.
  let timeline: Array<Record<string, unknown>> = []
  const latestWithGcode = [...fulfillments].reverse().find((f) => f.gcode)
  if (goship && latestWithGcode?.gcode) {
    try {
      timeline = await goship.listShipmentTimeline(latestWithGcode.gcode)
    } catch (err) {
      logger.warn(`[goship] không đọc được timeline: ${String(err)}`)
    }
  }

  const shipping = fulfillments.length
    ? {
        ...fulfillments[fulfillments.length - 1],
        // Ưu tiên URL admin nhập trong modal; nếu chưa có, lấy link theo dõi
        // GoShip gửi kèm trong sự kiện vận đơn gần nhất để khách bấm được.
        tracking_url:
          fulfillments[fulfillments.length - 1].tracking_url ??
          ([...timeline].reverse().find((e) => e.tracking_url)?.tracking_url as
            | string
            | null
            | undefined) ??
          null,
        timeline,
      }
    : null

  // Loại các trường nội bộ chỉ dùng để tính trạng thái trước khi trả về.
  const publicOrder = { ...order } as Record<string, unknown>
  delete publicOrder.payment_collections
  for (const item of (publicOrder.items ?? []) as Array<
    Record<string, unknown>
  >) {
    delete item.detail
    delete item.raw_quantity
  }

  res.json({
    order: {
      ...publicOrder,
      payment_status: paymentStatus,
      fulfillment_status: fulfillmentStatus,
      fulfillments,
      shipping,
    },
  })
}
