/**
 * Order confirmation copy.
 *
 * Keys are owned by this file — add new ones here rather than in `core.ts`
 * (`order.pageTitle` / `order.pageDescription` live there).
 *
 * `vi` is the source of truth for keys (Vietnamese-first); `en` mirrors it.
 */
export const vi = {
  "order.confirmation": "Xác nhận đơn hàng",
  "order.thankYou": "Cảm ơn bạn đã đặt hàng!",
  "order.placed": "Đơn hàng của bạn đã được đặt thành công.",
  "order.confirmationEmail": "Một email xác nhận đã được gửi đến",

  "order.items": "Sản phẩm trong đơn hàng",
  "order.summary": "Tóm tắt đơn hàng",
  "order.subtotal": "Tạm tính",
  "order.shipping": "Phí vận chuyển ({{name}})",
  "order.taxes": "Thuế",
  "order.discount": "Giảm giá",
  "order.total": "Tổng cộng",

  "order.deliveryPayment": "Giao hàng và thanh toán",
  "order.shippingAddress": "Địa chỉ giao hàng",
  "order.billingAddress": "Địa chỉ thanh toán",
  "order.sameAsShipping": "Giống địa chỉ giao hàng",
  "order.payment": "Thanh toán",
  "order.manualPayment": "Thanh toán thủ công",

  "order.nextSteps": "Tiếp theo sẽ diễn ra như thế nào?",
  "order.processing": "Đang xử lý đơn hàng",
  "order.processingText": "Chúng tôi đang chuẩn bị sản phẩm của bạn để gửi đi.",
  "order.shipmentNotification": "Thông báo gửi hàng",
  "order.shipmentNotificationText":
    "Bạn sẽ nhận được email kèm thông tin theo dõi đơn hàng khi đơn hàng được gửi đi.",
  "order.delivery": "Giao hàng",
  "order.deliveryText": "Bưu kiện của bạn sẽ được giao đến địa chỉ giao hàng.",

  "order.continueShopping": "Tiếp tục mua sắm",
};

export const en: typeof vi = {
  "order.confirmation": "Order confirmation",
  "order.thankYou": "Thank you for your order!",
  "order.placed": "Your order has been placed successfully.",
  "order.confirmationEmail": "A confirmation email has been sent to",

  "order.items": "Order Items",
  "order.summary": "Order Summary",
  "order.subtotal": "Subtotal",
  "order.shipping": "Shipping ({{name}})",
  "order.taxes": "Taxes",
  "order.discount": "Discount",
  "order.total": "Total",

  "order.deliveryPayment": "Delivery & Payment",
  "order.shippingAddress": "Shipping Address",
  "order.billingAddress": "Billing Address",
  "order.sameAsShipping": "Same as shipping address",
  "order.payment": "Payment",
  "order.manualPayment": "Manual Payment",

  "order.nextSteps": "What happens next?",
  "order.processing": "Order Processing",
  "order.processingText": "We're preparing your items for shipment.",
  "order.shipmentNotification": "Shipment Notification",
  "order.shipmentNotificationText":
    "You'll receive an email with tracking information when your order ships.",
  "order.delivery": "Delivery",
  "order.deliveryText": "Your package will arrive at your shipping address.",

  "order.continueShopping": "Continue Shopping",
};
