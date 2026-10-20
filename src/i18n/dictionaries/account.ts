/**
 * Customer account surfaces: login, signup and the header link.
 *
 * Keys are owned by this file — add new ones here rather than in `core.ts`.
 *
 * `vi` is the source of truth for keys (Vietnamese-first); `en` mirrors it.
 * `account.error.*` keys map the stable AuthErrorCode values from
 * `lib/utils/auth-session.ts` to user-facing copy.
 */
export const vi = {
  "account.navLink": "Tài khoản",

  "account.login.pageTitle": "Đăng nhập",
  "account.login.pageDescription":
    "Đăng nhập vào tài khoản Demostore để theo dõi đơn hàng và thanh toán nhanh hơn.",
  "account.login.title": "Đăng nhập",
  "account.login.subtitle": "Chào mừng bạn quay trở lại.",
  "account.login.submit": "Đăng nhập",
  "account.login.noAccount": "Chưa có tài khoản?",
  "account.login.registerLink": "Đăng ký",

  "account.register.pageTitle": "Đăng ký",
  "account.register.pageDescription":
    "Tạo tài khoản Demostore để theo dõi đơn hàng và thanh toán nhanh hơn.",
  "account.register.title": "Tạo tài khoản",
  "account.register.subtitle":
    "Đăng ký trong vài giây — theo dõi đơn hàng và lưu thông tin giao hàng.",
  "account.register.submit": "Tạo tài khoản",
  "account.register.haveAccount": "Đã có tài khoản?",
  "account.register.loginLink": "Đăng nhập",

  "account.field.email": "Email",
  "account.field.emailPlaceholder": "ban@example.com",
  "account.field.password": "Mật khẩu",
  "account.field.passwordHint": "Tối thiểu 8 ký tự",
  "account.field.firstName": "Họ",
  "account.field.lastName": "Tên",

  "account.working": "Đang xử lý...",

  "account.dashboard.pageTitle": "Tài khoản của tôi",
  "account.dashboard.pageDescription":
    "Quản lý thông tin cá nhân tại tài khoản Demostore.",
  "account.dashboard.title": "Tài khoản",
  "account.dashboard.greeting": "Xin chào, {{name}}",
  "account.dashboard.loading": "Đang tải...",

  "account.profile.title": "Thông tin cá nhân",
  "account.profile.emailReadonly": "Email (không thể thay đổi)",
  "account.profile.phone": "Số điện thoại",
  "account.profile.phoneHint": "Tùy chọn",
  "account.profile.phoneInvalid": "Số điện thoại không hợp lệ",
  "account.profile.save": "Lưu thay đổi",
  "account.profile.saved": "Đã lưu thông tin của bạn",
  "account.profile.saveFailed": "Không thể lưu, vui lòng thử lại",

  "account.logout": "Đăng xuất",

  "account.dashboard.ordersTitle": "Đơn hàng của bạn",
  "account.dashboard.ordersCta": "Xem đơn hàng",

  "account.orders.pageTitle": "Đơn hàng của tôi",
  "account.orders.pageDescription":
    "Theo dõi các đơn hàng đã đặt tại Demostore.",
  "account.orders.title": "Đơn hàng",
  "account.orders.loading": "Đang tải...",
  "account.orders.loadFailed": "Không thể tải đơn hàng, vui lòng thử lại",
  "account.orders.empty": "Bạn chưa có đơn hàng nào",
  "account.orders.shopCta": "Mua sắm ngay",
  "account.orders.orderNo": "Đơn hàng #{{id}}",
  "account.orders.itemsCount": "{{count}} sản phẩm",
  "account.orders.orderDate": "Ngày đặt",
  "account.orders.quantity": "Số lượng",
  "account.orders.subtotal": "Tạm tính",
  "account.orders.shipping": "Phí vận chuyển",
  "account.orders.tax": "Thuế",
  "account.orders.total": "Tổng cộng",
  "account.orders.shippingTo": "Địa chỉ nhận hàng",
  "account.orders.backToList": "Quay lại danh sách đơn hàng",
  "account.orders.notFound": "Không tìm thấy đơn hàng này",

  "account.status.pending": "Chờ xử lý",
  "account.status.authorized": "Đã xác nhận",
  "account.status.partially_fulfilled": "Giao hàng một phần",
  "account.status.fulfilled": "Đã giao hàng",
  "account.status.partially_returned": "Trả hàng một phần",
  "account.status.returned": "Đã trả hàng",
  "account.status.canceled": "Đã hủy",
  "account.status.requires_action": "Chờ thanh toán",
  "account.status.draft": "Nháp",

  "account.error.emailRequired": "Vui lòng nhập email",
  "account.error.emailInvalid": "Email không hợp lệ",
  "account.error.passwordRequired": "Vui lòng nhập mật khẩu",
  "account.error.passwordTooShort": "Mật khẩu cần ít nhất 8 ký tự",
  "account.error.nameRequired": "Vui lòng nhập họ và tên",

  "account.error.invalid_credentials": "Email hoặc mật khẩu không đúng",
  "account.error.email_taken": "Email này đã được đăng ký",
  "account.error.session_expired":
    "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại",
  "account.error.network": "Không thể kết nối, vui lòng thử lại",
  "account.error.server": "Đã có lỗi xảy ra, vui lòng thử lại",
  "account.error.unknown": "Đã có lỗi xảy ra, vui lòng thử lại",
  "account.error.invalid_verification":
    "Mã xác thực không đúng hoặc đã hết hạn",
};

export const en: typeof vi = {
  "account.navLink": "Account",

  "account.login.pageTitle": "Sign in",
  "account.login.pageDescription":
    "Sign in to your Demostore account to track orders and check out faster.",
  "account.login.title": "Sign in",
  "account.login.subtitle": "Welcome back.",
  "account.login.submit": "Sign in",
  "account.login.noAccount": "Don't have an account?",
  "account.login.registerLink": "Sign up",

  "account.register.pageTitle": "Sign up",
  "account.register.pageDescription":
    "Create a Demostore account to track orders and check out faster.",
  "account.register.title": "Create an account",
  "account.register.subtitle":
    "Sign up in seconds — track orders and save delivery details.",
  "account.register.submit": "Create account",
  "account.register.haveAccount": "Already have an account?",
  "account.register.loginLink": "Sign in",

  "account.field.email": "Email",
  "account.field.emailPlaceholder": "you@example.com",
  "account.field.password": "Password",
  "account.field.passwordHint": "At least 8 characters",
  "account.field.firstName": "First name",
  "account.field.lastName": "Last name",

  "account.working": "Working...",

  "account.dashboard.pageTitle": "My account",
  "account.dashboard.pageDescription":
    "Manage your details at your Demostore account.",
  "account.dashboard.title": "Account",
  "account.dashboard.greeting": "Hello, {{name}}",
  "account.dashboard.loading": "Loading...",

  "account.profile.title": "Personal information",
  "account.profile.emailReadonly": "Email (cannot be changed)",
  "account.profile.phone": "Phone number",
  "account.profile.phoneHint": "Optional",
  "account.profile.phoneInvalid": "Invalid phone number",
  "account.profile.save": "Save changes",
  "account.profile.saved": "Your details have been saved",
  "account.profile.saveFailed": "Could not save, please try again",

  "account.logout": "Sign out",

  "account.dashboard.ordersTitle": "Your orders",
  "account.dashboard.ordersCta": "View orders",

  "account.orders.pageTitle": "My orders",
  "account.orders.pageDescription": "Track the orders you placed at Demostore.",
  "account.orders.title": "Orders",
  "account.orders.loading": "Loading...",
  "account.orders.loadFailed": "Could not load orders, please try again",
  "account.orders.empty": "You have no orders yet",
  "account.orders.shopCta": "Start shopping",
  "account.orders.orderNo": "Order #{{id}}",
  "account.orders.itemsCount": "{{count}} items",
  "account.orders.orderDate": "Placed on",
  "account.orders.quantity": "Quantity",
  "account.orders.subtotal": "Subtotal",
  "account.orders.shipping": "Shipping",
  "account.orders.tax": "Tax",
  "account.orders.total": "Total",
  "account.orders.shippingTo": "Shipping address",
  "account.orders.backToList": "Back to orders",
  "account.orders.notFound": "Order not found",

  "account.status.pending": "Pending",
  "account.status.authorized": "Authorized",
  "account.status.partially_fulfilled": "Partially fulfilled",
  "account.status.fulfilled": "Fulfilled",
  "account.status.partially_returned": "Partially returned",
  "account.status.returned": "Returned",
  "account.status.canceled": "Canceled",
  "account.status.requires_action": "Requires action",
  "account.status.draft": "Draft",

  "account.error.emailRequired": "Please enter your email",
  "account.error.emailInvalid": "Invalid email address",
  "account.error.passwordRequired": "Please enter your password",
  "account.error.passwordTooShort": "Password must be at least 8 characters",
  "account.error.nameRequired": "Please enter your name",

  "account.error.invalid_credentials": "Incorrect email or password",
  "account.error.email_taken": "This email is already registered",
  "account.error.session_expired": "Your session expired, please sign in again",
  "account.error.network": "Cannot connect, please try again",
  "account.error.server": "Something went wrong, please try again",
  "account.error.unknown": "Something went wrong, please try again",
  "account.error.invalid_verification": "Invalid or expired verification code",
};
