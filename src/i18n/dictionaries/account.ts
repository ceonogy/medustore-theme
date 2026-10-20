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
