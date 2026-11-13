import {
  getLastFulfillmentStatus,
  getLastPaymentStatus,
} from "@medusajs/core-flows"
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/** Page size for the account order list; clients may pass 1–100. */
const DEFAULT_TAKE = 30
const MAX_TAKE = 100

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
  // Nguồn để tính `payment_status` / `fulfillment_status` (xem core-flows).
  "items.raw_quantity",
  "items.detail.raw_fulfilled_quantity",
  "payment_collections.amount",
  "payment_collections.captured_amount",
  "payment_collections.refunded_amount",
  "payment_collections.status",
  "fulfillments.packed_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "shipping_address.*",
  "billing_address.*",
]

/**
 * GET /store/account/orders — the signed-in customer's orders.
 *
 * Matches orders by `customer_id` OR by the customer's email so orders placed
 * as a guest before signing up (email match) still show up in the account.
 *
 * Paginated: `?take=1..100&skip=N` (default 30/page). Responds with
 * `{ orders, count, take, skip }` — `count` is the customer's total so the
 * UI can offer "load more" instead of silently truncating long histories.
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

  const takeRaw = Number.parseInt(String(req.query.take ?? ""), 10)
  const skipRaw = Number.parseInt(String(req.query.skip ?? ""), 10)
  const take = Number.isFinite(takeRaw)
    ? Math.min(Math.max(takeRaw, 1), MAX_TAKE)
    : DEFAULT_TAKE
  const skip = Number.isFinite(skipRaw) ? Math.max(skipRaw, 0) : 0

  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: { id: actorId },
  })
  const customer = customers[0]
  if (!customer?.email) {
    return res.status(404).json({ message: "Customer not found" })
  }

  const filters = {
    $or: [{ customer_id: customer.id }, { email: customer.email }],
  }

  // Total (pre-pagination) so the client knows whether more pages exist.
  const { metadata } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters,
    pagination: { take: 1, skip: 0 },
  })

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters,
    pagination: { take, skip, order: { created_at: "DESC" } },
  })

  // An order can satisfy both sides of the $or — return it once.
  const seen = new Set<string>()
  const deduped = orders.filter((order) => {
    if (seen.has(order.id)) {
      return false
    }
    seen.add(order.id)
    return true
  })

  // `payment_status` / `fulfillment_status` không phải cột DB mà do Medusa
  // tính từ payment_collections + fulfillments; `query.graph` không trả về
  // nên ta tính thủ công bằng helper core-flows (khớp Admin API).
  const enriched = deduped.map((order) => {
    const payment_status = getLastPaymentStatus(order as never)
    const fulfillment_status = getLastFulfillmentStatus(order as never)
    const publicOrder = { ...order } as Record<string, unknown>
    delete publicOrder.payment_collections
    for (const item of (publicOrder.items ?? []) as Array<
      Record<string, unknown>
    >) {
      delete item.detail
      delete item.raw_quantity
    }
    return { ...publicOrder, payment_status, fulfillment_status }
  })

  res.json({
    orders: enriched,
    count: metadata?.count ?? deduped.length + skip,
    take,
    skip,
  })
}
