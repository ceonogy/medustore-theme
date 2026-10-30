import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

type OrderPlacedEvent = { id: string }

/**
 * Sends the order-confirmation email when an order is placed.
 *
 * Follows the official Medusa Resend-integration guide: the event payload
 * is only `{ id }`, so the subscriber queries the full order through Query
 * and hands it to the Notification Module (`createNotifications`), which
 * delegates to the Brevo provider (src/modules/brevo).
 */
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: orders } = await query.graph({
      entity: "order",
      filters: { id: data.id },
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "subtotal",
        "discount_total",
        "shipping_total",
        "tax_total",
        "item_subtotal",
        "items.*",
        "shipping_address.*",
        "customer.*",
        "shipping_methods.*",
        "payment_collections.status",
        "payment_collections.payment_sessions.provider_id",
        "payment_collections.payment_sessions.status",
        "payment_collections.payment_sessions.amount",
        "payment_collections.payment_sessions.data",
      ],
    })

    const order = orders?.[0] as { email?: string | null } | undefined
    if (!order?.email) {
      logger.info(`order.placed ${data.id}: no email on order, skipping mail`)
      return
    }

    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications([
      {
        to: order.email,
        channel: "email",
        template: "order-placed",
        data: { order: orders[0] },
      },
    ])
  } catch (error) {
    logger.error(`order.placed ${data.id}: confirmation mail failed: ${String(error)}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
