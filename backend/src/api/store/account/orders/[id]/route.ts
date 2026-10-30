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
  "shipping_address.*",
  "billing_address.*",
]

/**
 * GET /store/account/orders/:id — a single order of the signed-in customer.
 * 404 when the order does not belong to them (customer_id or email match).
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

  res.json({ order: orders[0] })
}
