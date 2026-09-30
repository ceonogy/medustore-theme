/**
 * Checkout flow copy: address, delivery, payment steps and the order summary.
 *
 * Keys are owned by this file — add new ones here rather than in `core.ts`.
 */
export const vi = {
  "checkout.pageTitle": "Thanh toán",
  "checkout.pageDescription": "Hoàn tất việc mua hàng của bạn.",

  // CheckoutPage
  "checkout.page.emptyCartTitle": "Giỏ hàng của bạn đang trống",
  "checkout.page.emptyCartText":
    "Hãy thêm sản phẩm vào giỏ trước khi thanh toán.",
  "checkout.page.continueShopping": "Tiếp tục mua sắm",

  // AddressFields
  "checkout.address.firstName": "Họ*",
  "checkout.address.lastName": "Tên*",
  "checkout.address.address": "Địa chỉ*",
  "checkout.address.company": "Công ty",
  "checkout.address.postalCode": "Mã bưu chính*",
  "checkout.address.city": "Thành phố*",
  "checkout.address.country": "Quốc gia",
  "checkout.address.province": "Tiểu bang / Tỉnh",

  // Validation messages (ShippingAddressStep)
  "checkout.validation.firstNameRequired": "Vui lòng nhập họ.",
  "checkout.validation.lastNameRequired": "Vui lòng nhập tên.",
  "checkout.validation.addressRequired": "Vui lòng nhập địa chỉ.",
  "checkout.validation.postalCodeRequired": "Vui lòng nhập mã bưu chính.",
  "checkout.validation.cityRequired": "Vui lòng nhập thành phố.",
  "checkout.validation.countryRequired": "Vui lòng chọn quốc gia.",
  "checkout.validation.emailRequired": "Vui lòng nhập email.",
  "checkout.validation.emailInvalid": "Vui lòng nhập địa chỉ email hợp lệ.",

  // ShippingAddressStep
  "checkout.shipping.title": "Địa chỉ giao hàng",
  "checkout.shipping.contact": "Liên hệ",
  "checkout.shipping.billingTitle": "Địa chỉ thanh toán",
  "checkout.shipping.billingSame":
    "Địa chỉ thanh toán và giao hàng giống nhau.",
  "checkout.shipping.edit": "Chỉnh sửa",
  "checkout.shipping.billingSameCheckbox":
    "Địa chỉ thanh toán trùng với địa chỉ giao hàng",
  "checkout.shipping.email": "Email*",
  "checkout.shipping.phone": "Số điện thoại",
  "checkout.shipping.saveFailed": "Không thể lưu địa chỉ. Vui lòng thử lại.",
  "checkout.shipping.saving": "Đang lưu...",
  "checkout.shipping.continueToDelivery": "Tiếp tục đến bước giao hàng",

  // DeliveryStep
  "checkout.delivery.title": "Giao hàng",
  "checkout.delivery.edit": "Chỉnh sửa",
  "checkout.delivery.shippingMethod": "Phương thức vận chuyển",
  "checkout.delivery.subtitle": "Bạn muốn đơn hàng được giao như thế nào?",
  "checkout.delivery.free": "Miễn phí",
  "checkout.delivery.locker": "Tủ đồ: {{point}}",
  "checkout.delivery.loading": "Đang tải phương thức vận chuyển...",
  "checkout.delivery.empty":
    "Không có phương thức vận chuyển nào phù hợp với địa chỉ của bạn.",
  "checkout.delivery.loadFailed":
    "Không thể tải phương thức vận chuyển. Vui lòng thử lại.",
  "checkout.delivery.updateFailed":
    "Không thể cập nhật phương thức vận chuyển. Vui lòng thử lại.",
  "checkout.delivery.lockerSaveFailed":
    "Không thể lưu lựa chọn tủ đồ. Vui lòng thử lại.",
  "checkout.delivery.selectedLocker": "Tủ đồ đã chọn:",
  "checkout.delivery.chooseLocker": "Chọn tủ đồ",
  "checkout.delivery.changeLocker": "Đổi tủ đồ",
  "checkout.delivery.saving": "Đang lưu...",
  "checkout.delivery.continueToPayment": "Tiếp tục đến thanh toán",

  // PaymentStep
  "checkout.payment.title": "Thanh toán",
  "checkout.payment.testOnly": "Lưu ý: Chỉ dùng cho mục đích kiểm thử.",
  "checkout.payment.loading": "Đang tải phương thức thanh toán...",
  "checkout.payment.empty": "Không có phương thức thanh toán nào khả dụng.",
  "checkout.payment.loadFailed":
    "Không thể tải phương thức thanh toán. Vui lòng thử lại.",
  "checkout.payment.setFailed":
    "Không thể đặt phương thức thanh toán. Vui lòng thử lại.",
  "checkout.payment.paymentFailed": "Thanh toán thất bại. Vui lòng thử lại.",
  "checkout.payment.placeOrderFailed": "Không thể đặt hàng. Vui lòng thử lại.",
  "checkout.payment.placing": "Đang đặt hàng...",
  "checkout.payment.placeOrder": "Đặt hàng",

  // OrderSummary
  "checkout.summary.title": "Giỏ hàng của bạn",
  "checkout.summary.subtotal": "Tạm tính (chưa gồm phí vận chuyển và thuế)",
  "checkout.summary.shipping": "Phí vận chuyển",
  "checkout.summary.taxes": "Thuế",
  "checkout.summary.total": "Tổng cộng",
  "checkout.summary.productFallback": "Sản phẩm",
  "checkout.summary.variant": "Phiên bản: {{variant}}",

  // InPostGeoWidget
  "checkout.inpost.close": "Đóng",
};

export const en: typeof vi = {
  "checkout.pageTitle": "Checkout",
  "checkout.pageDescription": "Complete your purchase.",

  // CheckoutPage
  "checkout.page.emptyCartTitle": "Your cart is empty",
  "checkout.page.emptyCartText": "Add items before checking out.",
  "checkout.page.continueShopping": "Continue Shopping",

  // AddressFields
  "checkout.address.firstName": "First name*",
  "checkout.address.lastName": "Last name*",
  "checkout.address.address": "Address*",
  "checkout.address.company": "Company",
  "checkout.address.postalCode": "Postal code*",
  "checkout.address.city": "City*",
  "checkout.address.country": "Country",
  "checkout.address.province": "State / Province",

  // Validation messages (ShippingAddressStep)
  "checkout.validation.firstNameRequired": "First name is required",
  "checkout.validation.lastNameRequired": "Last name is required",
  "checkout.validation.addressRequired": "Address is required",
  "checkout.validation.postalCodeRequired": "Postal code is required",
  "checkout.validation.cityRequired": "City is required",
  "checkout.validation.countryRequired": "Country is required",
  "checkout.validation.emailRequired": "Email is required",
  "checkout.validation.emailInvalid": "Enter a valid email address",

  // ShippingAddressStep
  "checkout.shipping.title": "Shipping Address",
  "checkout.shipping.contact": "Contact",
  "checkout.shipping.billingTitle": "Billing Address",
  "checkout.shipping.billingSame": "Billing and delivery address are the same.",
  "checkout.shipping.edit": "Edit",
  "checkout.shipping.billingSameCheckbox":
    "Billing address same as shipping address",
  "checkout.shipping.email": "Email*",
  "checkout.shipping.phone": "Phone",
  "checkout.shipping.saveFailed": "Failed to save address. Please try again.",
  "checkout.shipping.saving": "Saving...",
  "checkout.shipping.continueToDelivery": "Continue to delivery",

  // DeliveryStep
  "checkout.delivery.title": "Delivery",
  "checkout.delivery.edit": "Edit",
  "checkout.delivery.shippingMethod": "Shipping method",
  "checkout.delivery.subtitle": "How would you like your order delivered",
  "checkout.delivery.free": "Free",
  "checkout.delivery.locker": "Locker: {{point}}",
  "checkout.delivery.loading": "Loading shipping options...",
  "checkout.delivery.empty": "No shipping options available for your address.",
  "checkout.delivery.loadFailed":
    "Failed to load shipping options. Please try again.",
  "checkout.delivery.updateFailed":
    "Failed to update shipping method. Please try again.",
  "checkout.delivery.lockerSaveFailed":
    "Failed to save locker selection. Please try again.",
  "checkout.delivery.selectedLocker": "Selected locker:",
  "checkout.delivery.chooseLocker": "Choose locker",
  "checkout.delivery.changeLocker": "Change locker",
  "checkout.delivery.saving": "Saving...",
  "checkout.delivery.continueToPayment": "Continue to payment",

  // PaymentStep
  "checkout.payment.title": "Payment",
  "checkout.payment.testOnly": "Attention: For testing purposes only.",
  "checkout.payment.loading": "Loading payment options...",
  "checkout.payment.empty": "No payment options available.",
  "checkout.payment.loadFailed":
    "Failed to load payment options. Please try again.",
  "checkout.payment.setFailed":
    "Failed to set payment method. Please try again.",
  "checkout.payment.paymentFailed": "Payment failed. Please try again.",
  "checkout.payment.placeOrderFailed":
    "Failed to place order. Please try again.",
  "checkout.payment.placing": "Placing order...",
  "checkout.payment.placeOrder": "Place order",

  // OrderSummary
  "checkout.summary.title": "In your Cart",
  "checkout.summary.subtotal": "Subtotal (excl. shipping and taxes)",
  "checkout.summary.shipping": "Shipping",
  "checkout.summary.taxes": "Taxes",
  "checkout.summary.total": "Total",
  "checkout.summary.productFallback": "Product",
  "checkout.summary.variant": "Variant: {{variant}}",

  // InPostGeoWidget
  "checkout.inpost.close": "Close",
};
