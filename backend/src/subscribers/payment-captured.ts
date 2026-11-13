import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

type PaymentCapturedEvent = { id: string }

/**
 * Gửi email "đã nhận thanh toán" khi một khoản thanh toán được capture.
 *
 * Sự kiện `payment.captured` chỉ mang `{ id: payment }`. Với SePay, capture
 * xảy ra khi webhook xác nhận tiền đã về (`capturePayment` ghi
 * `sepay_captured_at`), nên email này là thông báo "tiền đã vào".
 *
 * Chỉ gửi cho provider `pp_sepay`: với provider thủ công
 * (`pp_system_default`) khoản thu được ghi nhận ngay khi đặt hàng (đã có email
 * xác nhận đơn) nên gửi thêm sẽ trùng. Email thất bại được nuốt lỗi (chỉ log)
 * để không ảnh hưởng luồng thanh toán.
 */
export default async function paymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<PaymentCapturedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const { data: payments } = await query.graph({
      entity: "payment",
      fields: ["id", "provider_id", "amount", "captured_at", "payment_collection_id"],
      filters: { id: data.id },
    })
    const payment = payments?.[0]
    if (!payment) {
      logger.warn(`payment.captured ${data.id}: không tìm thấy payment, bỏ qua.`)
      return
    }
    if (payment.provider_id !== "pp_sepay") {
      return
    }

    // payment collection → order (link `order_payment_collection`)
    const { data: links } = await query.graph({
      entity: "order_payment_collection",
      fields: ["order.id"],
      filters: { payment_collection_id: payment.payment_collection_id },
    })
    const orderId = links?.[0]?.order?.id
    if (!orderId) {
      logger.warn(
        `payment.captured ${data.id}: không suy ra được order (collection ${payment.payment_collection_id}).`,
      )
      return
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "items.*",
        "shipping_address.*",
        "customer.*",
      ],
      filters: { id: orderId },
    })
    const order = orders?.[0] as { email?: string | null } | undefined
    if (!order?.email) {
      logger.info(`payment.captured ${data.id}: order ${orderId} thiếu email, bỏ qua.`)
      return
    }

    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications([
      {
        to: order.email,
        channel: "email",
        template: "payment-received",
        data: {
          order: orders[0],
          payment: { amount: payment.amount, captured_at: payment.captured_at },
        },
      },
    ])
  } catch (error) {
    logger.error(
      `payment.captured ${data.id}: gửi email "đã nhận thanh toán" thất bại: ${String(error)}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
