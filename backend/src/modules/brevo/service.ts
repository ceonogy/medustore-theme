import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"

type BrevoOptions = {
  api_key?: string
  from?: string
  from_name?: string
  store_url?: string
}

type InjectedDependencies = {
  logger: Logger
}

/**
 * Brevo (formerly Sendinblue) notification provider.
 *
 * Follows the official Medusa "Integrate with Resend" guide structure —
 * a Notification Module Provider whose `send` method talks to the
 * provider's HTTP API (Brevo v3 `/smtp/email`) — with plain inline-HTML
 * Vietnamese templates instead of react-email.
 *
 * Delivery failures are logged and swallowed (returns `{}`) so a mail
 * outage can never break checkout or auth flows. A missing API key
 * degrades the provider to a logged no-op instead of failing boot.
 */
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"

enum Templates {
  ORDER_PLACED = "order-placed",
  PAYMENT_RECEIVED = "payment-received",
  VERIFICATION_CODE = "verification-code",
  PASSWORD_RESET = "password-reset",
}

type TemplateResult = { subject: string; html: string }

/** Mirrors the storefront's convertToLocale(): raw Intl currency format,
 *  vi-VN grouping for VND ("490.000 ₫"), en-US for everything else. */
const formatAmount = (amount: number | null | undefined, currency?: string) => {
  if (amount == null || !currency) return ""
  const locale = currency.toLowerCase() === "vnd" ? "vi-VN" : "en-US"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(Number(amount))
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const layout = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#111">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 0">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2dfd9;border-radius:8px;overflow:hidden">
          <tr><td style="background:#111111;color:#ffffff;padding:18px 28px;font-size:15px;font-weight:bold;letter-spacing:2px">DEMOSTORE</td></tr>
          <tr><td style="padding:28px">${bodyHtml}</td></tr>
          <tr><td style="background:#faf9f7;border-top:1px solid #e2dfd9;padding:18px 28px;font-size:12px;color:#6b7280">
            Email tự động từ Demostore &mdash; vui lòng không trả lời email này.<br/>
            Liên hệ: <a href="mailto:info@ceonogy.com" style="color:#111">info@ceonogy.com</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

type OrderEmailData = {
  id?: string
  display_id?: number | string
  email?: string
  currency_code?: string
  total?: number
  subtotal?: number
  shipping_total?: number
  tax_total?: number
  discount_total?: number
  items?: {
    id?: string
    product_title?: string
    variant_title?: string | null
    quantity?: number
    total?: number
  }[]
  shipping_address?: { first_name?: string | null; last_name?: string | null } | null
  customer?: { first_name?: string | null; last_name?: string | null } | null
  payment_collections?: Array<{
    status?: string | null
    payment_sessions?: Array<{
      provider_id?: string | null
      status?: string | null
      amount?: number | null
      data?: Record<string, unknown> | null
    }> | null
  }> | null
}

type SePayTransfer = {
  qrCodeUrl: string | null
  bankName: string | null
  vaNumber: string | null
  holder: string | null
  amount: number | null
  orderCode: string | null
}

/** Lấy thông tin chuyển khoản SePay từ payment session của đơn (nếu có). */
const extractSePayTransfer = (order: OrderEmailData): SePayTransfer | null => {
  for (const collection of order.payment_collections ?? []) {
    const session = (collection?.payment_sessions ?? []).find(
      (s) => s?.provider_id === "pp_sepay",
    )
    if (!session) continue
    const d = (session.data ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (v == null ? null : String(v))
    return {
      qrCodeUrl: str(d.sepay_qr_code_url),
      bankName: str(d.sepay_bank_name),
      vaNumber: str(d.sepay_va_number),
      holder: str(d.sepay_va_holder_name),
      amount: typeof d.amount === "number" ? d.amount : (session.amount ?? null),
      orderCode: str(d.sepay_order_code),
    }
  }
  return null
}

/** Khối "thanh toán chuyển khoản" (QR + VA) cho email xác nhận đơn. */
const sepayTransferBlock = (
  transfer: SePayTransfer,
  currencyCode: string | undefined,
): string => {
  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:4px 0;font-size:13px;color:#6b7280">${label}</td>
       <td style="padding:4px 0;font-size:13px;text-align:right"><strong>${escapeHtml(value)}</strong></td>
     </tr>`
  const rows =
    (transfer.bankName ? row("Ngân hàng", transfer.bankName) : "") +
    (transfer.vaNumber ? row("Số tài khoản (VA)", transfer.vaNumber) : "") +
    (transfer.holder ? row("Chủ tài khoản", transfer.holder) : "") +
    (transfer.amount != null
      ? row("Số tiền", formatAmount(transfer.amount, currencyCode || "vnd"))
      : "") +
    (transfer.orderCode ? row("Nội dung chuyển khoản", transfer.orderCode) : "")
  const qr = transfer.qrCodeUrl
    ? `<img src="${escapeHtml(transfer.qrCodeUrl)}" alt="QR chuyển khoản" width="180" height="180" style="display:block;margin:0 auto 16px;border:1px solid #eceae5;border-radius:8px" />`
    : ""
  return `<div style="margin:20px 0;padding:20px;border:1px solid #e2dfd9;border-radius:8px;background:#faf9f7">
    <h2 style="font-size:16px;margin:0 0 8px">Thanh toán bằng chuyển khoản ngân hàng</h2>
    <p style="font-size:13px;color:#6b7280;margin:0 0 16px">Vui lòng chuyển đúng số tiền và nội dung bên dưới. Đơn hàng được xác nhận ngay khi chúng tôi nhận được tiền.</p>
    ${qr}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </div>`
}

const orderPlacedTemplate = (data: Record<string, unknown>): TemplateResult => {
  const order = (data.order ?? data) as OrderEmailData
  const number = order.display_id ?? order.id ?? ""
  const subject = `Đơn hàng #${number} đã được tiếp nhận`
  const name =
    order.customer?.first_name ||
    order.shipping_address?.first_name ||
    ""
  const greeting = name ? `, ${escapeHtml(name)}` : ""

  const itemRows = (order.items ?? [])
    .map((item) => {
      const label = escapeHtml(
        [item.product_title, item.variant_title].filter(Boolean).join(" - "),
      )
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eceae5;font-size:14px">${label}</td>
        <td style="padding:10px 0;border-bottom:1px solid #eceae5;font-size:14px;text-align:center;color:#6b7280">${item.quantity ?? 1}x</td>
        <td style="padding:10px 0;border-bottom:1px solid #eceae5;font-size:14px;text-align:right">${escapeHtml(formatAmount(item.total, order.currency_code))}</td>
      </tr>`
    })
    .join("")

  const summaryRow = (label: string, value: string) =>
    `<tr>
       <td style="padding:4px 0;font-size:14px;color:#6b7280">${label}</td>
       <td style="padding:4px 0;font-size:14px;text-align:right">${escapeHtml(value)}</td>
     </tr>`

  const orderRows =
    (order.subtotal != null
      ? summaryRow("Tạm tính", formatAmount(order.subtotal, order.currency_code))
      : "") +
    ((order.shipping_total ?? 0) > 0
      ? summaryRow(
          "Phí vận chuyển",
          formatAmount(order.shipping_total, order.currency_code),
        )
      : "") +
    ((order.tax_total ?? 0) > 0
      ? summaryRow("Thuế", formatAmount(order.tax_total, order.currency_code))
      : "") +
    ((order.discount_total ?? 0) > 0
      ? summaryRow(
          "Giảm giá",
          `-${formatAmount(order.discount_total, order.currency_code)}`,
        )
      : "")

  const storeUrl =
    typeof data.store_url === "string" && data.store_url
      ? data.store_url
      : "https://demostore.ceonogy.com"

  // Link back to the order page. Bank-transfer (SePay) orders show their
  // QR/VA there and poll until the money arrives, so a customer who closes
  // the tab can reopen the payment instructions from this email.
  const baseUrl = storeUrl.replace(/\/+$/, "")
  const orderUrl = order.id
    ? `${baseUrl}/order/confirmed?order=${encodeURIComponent(String(order.id))}`
    : storeUrl

  // Khách chọn chuyển khoản → nhúng luôn QR/VA vào email để không phải quay
  // lại trang (đóng tab sau khi đặt hàng vẫn có đủ thông tin chuyển tiền).
  const transfer = extractSePayTransfer(order)
  const transferBlock = transfer
    ? sepayTransferBlock(transfer, order.currency_code)
    : ""

  const body = `
    <h1 style="font-size:22px;margin:0 0 8px">Cảm ơn bạn${greeting}!</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Đơn hàng của bạn đã được tiếp nhận và đang được xử lý. Chúng tôi sẽ thông báo khi hàng được giao.</p>
    <p style="font-size:14px;margin:0 0 4px"><strong>Mã đơn hàng:</strong> #${escapeHtml(number)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;border-top:1px solid #eceae5">${itemRows}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
      ${orderRows}
      <tr><td style="padding:12px 0 0;border-top:1px solid #111;font-size:16px;font-weight:bold"><strong>Tổng cộng</strong></td>
      <td style="padding:12px 0 0;border-top:1px solid #111;font-size:16px;font-weight:bold;text-align:right"><strong>${escapeHtml(formatAmount(order.total, order.currency_code))}</strong></td></tr>
    </table>
    ${transferBlock}
    <p style="margin-top:24px"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px">Xem đơn hàng &amp; thanh toán</a></p>
    <p style="margin-top:12px;font-size:13px"><a href="${escapeHtml(storeUrl)}" style="color:#6b7280">Tiếp tục mua sắm</a></p>`

  return { subject, html: layout(subject, body) }
}

const paymentReceivedTemplate = (
  data: Record<string, unknown>,
): TemplateResult => {
  const order = (data.order ?? data) as OrderEmailData
  const number = order.display_id ?? order.id ?? ""
  const subject = `Đã nhận thanh toán cho đơn hàng #${number}`
  const name =
    order.customer?.first_name ||
    order.shipping_address?.first_name ||
    ""
  const greeting = name ? `, ${escapeHtml(name)}` : ""
  const payment = (data.payment ?? {}) as { amount?: number | null }
  const paidAmount = payment.amount ?? order.total

  const storeUrl =
    typeof data.store_url === "string" && data.store_url
      ? data.store_url
      : "https://demostore.ceonogy.com"
  const baseUrl = storeUrl.replace(/\/+$/, "")
  const orderUrl = order.id
    ? `${baseUrl}/order/confirmed?order=${encodeURIComponent(String(order.id))}`
    : storeUrl

  const body = `
    <h1 style="font-size:22px;margin:0 0 8px">Đã nhận thanh toán${greeting}</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Chúng tôi đã nhận được thanh toán cho đơn hàng của bạn. Đơn hàng đang được xử lý và sẽ sớm được giao.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
      <tr><td style="padding:4px 0;font-size:14px;color:#6b7280">Mã đơn hàng</td>
      <td style="padding:4px 0;font-size:14px;text-align:right"><strong>#${escapeHtml(number)}</strong></td></tr>
      <tr><td style="padding:12px 0 0;border-top:1px solid #111;font-size:16px;font-weight:bold">Số tiền đã nhận</td>
      <td style="padding:12px 0 0;border-top:1px solid #111;font-size:16px;font-weight:bold;text-align:right"><strong>${escapeHtml(formatAmount(paidAmount, order.currency_code))}</strong></td></tr>
    </table>
    <p style="margin-top:24px"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px">Xem đơn hàng</a></p>
    <p style="margin-top:12px;font-size:13px"><a href="${escapeHtml(storeUrl)}" style="color:#6b7280">Tiếp tục mua sắm</a></p>`

  return { subject, html: layout(subject, body) }
}

const verificationCodeTemplate = (
  data: Record<string, unknown>,
): TemplateResult => {
  const code = String(data.code ?? "")
  const subject = `Mã xác thực của bạn: ${code}`
  let expiry = ""
  if (data.expires_at) {
    const parsed = new Date(String(data.expires_at))
    if (!Number.isNaN(parsed.getTime())) {
      expiry = `<p style="font-size:13px;color:#6b7280;margin:14px 0 0">Mã có hiệu lực đến <strong>${escapeHtml(
        parsed.toLocaleString("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: "Asia/Ho_Chi_Minh",
        }),
      )}</strong></p>`
    }
  }
  const body = `
    <h1 style="font-size:22px;margin:0 0 8px">Xác thực địa chỉ email</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Nhập mã dưới đây để hoàn tất xác thực:</p>
    <p style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#f6f5f2;border:1px dashed #c9c4bc;border-radius:8px;padding:20px 0;margin:0">${escapeHtml(code)}</p>
    ${expiry}
    <p style="font-size:13px;color:#9ca3af;margin:20px 0 0">Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Không chia sẻ mã này với bất kỳ ai.</p>`
  return { subject, html: layout(subject, body) }
}

const passwordResetTemplate = (
  data: Record<string, unknown>,
): TemplateResult => {
  const token = String(data.token ?? "")
  const subject = "Đặt lại mật khẩu Demostore"
  const storeUrl =
    typeof data.store_url === "string" && data.store_url
      ? data.store_url
      : "https://demostore.ceonogy.com"
  // The token rides in the URL FRAGMENT, never a query param — fragments
  // are not sent to servers, so the secret stays out of access logs and
  // Referer headers. TTL and single-use are enforced server-side.
  const resetUrl = `${storeUrl}/tai-khoan/dat-lai-mat-khau#${encodeURIComponent(token)}`
  const body = `
    <h1 style="font-size:22px;margin:0 0 8px">Đặt lại mật khẩu</h1>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn nút dưới đây để chọn mật khẩu mới:</p>
    <p style="margin:0 0 18px"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:14px">Đặt lại mật khẩu</a></p>
    <p style="font-size:13px;color:#6b7280;margin:0 0 4px">Liên kết có hiệu lực trong <strong>15 phút</strong> và chỉ dùng được <strong>một lần</strong>.</p>
    <p style="font-size:13px;color:#9ca3af;margin:12px 0 0">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại của bạn không thay đổi.</p>`
  return { subject, html: layout(subject, body) }
}

const templates: Record<
  string,
  (data: Record<string, unknown>) => TemplateResult
> = {
  [Templates.ORDER_PLACED]: orderPlacedTemplate,
  [Templates.PAYMENT_RECEIVED]: paymentReceivedTemplate,
  [Templates.VERIFICATION_CODE]: verificationCodeTemplate,
  [Templates.PASSWORD_RESET]: passwordResetTemplate,
}

const subjects: Record<string, string> = {
  [Templates.ORDER_PLACED]: "Đơn hàng đã được tiếp nhận",
  [Templates.PAYMENT_RECEIVED]: "Đã nhận thanh toán",
  [Templates.VERIFICATION_CODE]: "Mã xác thực Demostore",
  [Templates.PASSWORD_RESET]: "Đặt lại mật khẩu Demostore",
}

/**
 * Render một template ra `{ subject, html }` — dùng cho test/công cụ đối soát
 * (không phải một phần của provider API). Trả `null` nếu template không tồn tại.
 */
export const renderTemplate = (
  template: string,
  data: Record<string, unknown>,
): TemplateResult | null => {
  const render = templates[template]
  return render ? render(data) : null
}

class BrevoNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-brevo"
  private options: BrevoOptions
  private logger: Logger

  constructor({ logger }: InjectedDependencies, options: BrevoOptions) {
    super()
    this.logger = logger
    this.options = options
  }

  async send(
    notification: ProviderSendNotificationDTO,
  ): Promise<ProviderSendNotificationResultsDTO> {
    const render = templates[notification.template as string]
    if (!render) {
      this.logger.error(
        `Brevo: unknown template "${notification.template}". Valid templates: ${Object.values(Templates).join(", ")}`,
      )
      return {}
    }

    const apiKey = this.options.api_key?.trim()
    if (!apiKey || !this.options.from) {
      this.logger.warn(
        `Brevo: mail disabled (BREVO_API_KEY/BREVO_FROM not configured) — would have sent "${notification.template}" to ${notification.to}`,
      )
      return {}
    }

    let rendered: TemplateResult
    try {
      const data = {
        ...(notification.data ?? {}),
        ...(this.options.store_url
          ? { store_url: this.options.store_url }
          : {}),
      } as Record<string, unknown>
      rendered = render(data)
    } catch (error) {
      this.logger.error(
        `Brevo: failed to render template "${notification.template}": ${String(error)}`,
      )
      return {}
    }

    try {
      const response = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: this.options.from,
            name: this.options.from_name || "Demostore",
          },
          to: [{ email: notification.to }],
          subject: rendered.subject,
          htmlContent: rendered.html,
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => "")
        this.logger.error(
          `Brevo: send failed (${response.status}) for "${notification.template}" to ${notification.to}: ${text.slice(0, 500)}`,
        )
        return {}
      }

      const json = (await response.json().catch(() => ({}))) as {
        messageId?: string
      }
      this.logger.info(
        `Brevo: sent "${notification.template}" to ${notification.to} (messageId ${json.messageId ?? "unknown"})`,
      )
      return { id: json.messageId }
    } catch (error) {
      this.logger.error(
        `Brevo: send error for "${notification.template}" to ${notification.to}: ${String(error)}`,
      )
      return {}
    }
  }
}

export default BrevoNotificationProviderService
