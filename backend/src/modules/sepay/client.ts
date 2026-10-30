import type { Logger } from "@medusajs/framework/types"

/**
 * HTTP client cho SePay API v2 (https://developer.sepay.vn/vi/sepay-api/v2).
 *
 *  - Bearer token, base URL theo môi trường:
 *      Live:  https://userapi.sepay.vn/v2
 *      Test:  https://userapi-sandbox.sepay.vn/v2   (token KHÔNG dùng chung)
 *  - Rate limit 3 req/giây/IP — client này chỉ gọi tuần tự trong luồng
 *    checkout (≤2 call/authorize + 1 call/authorize lần đầu), nên mặc định
 *    không cần token bucket; các caller không nên bắn song song.
 *  - Timeout 10s/req, không retry tự động (authorize có idempotency qua
 *    order_code — caller gọi lại được an toàn).
 */

export type SePayClientOptions = {
  apiToken?: string
  baseUrl?: string
  bankAccountId?: string
  /** Terminal Vietcombank (bắt buộc với VCB). Để trống → tự lấy terminal đầu tiên. */
  tid?: string
  logger?: Logger
}

export class SePayApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "SePayApiError"
    this.status = status
    this.body = body
  }
}

/**
 * SePay báo lỗi khi `order_code` đã tồn tại — kể cả với đơn đã hủy (mã đơn
 * không được tái sử dụng). Khi gặp lỗi này phải **đổi nonce** để sinh mã mới
 * (xem `deriveOrderCode(sessionId, nonce)`).
 */
export const isOrderCodeConflict = (err: unknown): boolean => {
  if (!(err instanceof SePayApiError)) return false
  const body = (err.body ?? {}) as { error_code?: string; message?: string }
  const text = `${body.error_code ?? ""} ${body.message ?? ""} ${err.message ?? ""}`.toLowerCase()
  return /order code|order_code|already exists/.test(text)
}

export type SePayOrder = {
  id: string
  order_code: string
  amount: number
  paid_amount: number
  status: "Pending" | "Paid" | "Partially" | "Cancelled" | string
  refund_status: string | null
  created_at: string
  /** VA number (trả ở cấp đơn cho VA-per-order). */
  va_number?: string | null
  va_holder_name?: string | null
  bank_name?: string
  account_number?: string
  account_holder_name?: string
  qr_code?: string
  qr_code_url?: string
  expired_at?: string | null
  va?: Array<{
    va_number: string
    va_holder_name: string
    amount: number
    status: string
    expired_at: string | null
    paid_at: string | null
  }>
}

type Terminal = { xid: string; tid: string; name: string }

/** Kết quả một lệnh hoàn tiền SePay (POST refund / GET refund detail). */
export type SePayRefund = {
  refund_id: string
  order_type?: string
  order_id?: string
  order_code?: string
  xid?: string
  transaction_id?: string
  original_reference?: string
  amount: number
  currency?: string
  scope?: string
  status: "pending" | "succeeded" | "failed" | "rejected" | string
  created_at: string
}

export class SePayClient {
  protected options_: SePayClientOptions
  protected tidCache_: string | null = null

  constructor(options: SePayClientOptions) {
    this.options_ = options
  }

  get configured(): boolean {
    return Boolean(this.options_.apiToken && this.options_.bankAccountId)
  }

  get bankAccountId(): string {
    const id = this.options_.bankAccountId
    if (!id) {
      throw new SePayApiError("SEPAY_BANK_ACCOUNT_ID chưa được cấu hình.", 0, null)
    }
    return id
  }

  protected get baseUrl(): string {
    return (this.options_.baseUrl || "https://userapi.sepay.vn/v2").replace(/\/$/, "")
  }

  protected async request<T>(
    path: string,
    init?: { method?: string; body?: unknown; headers?: Record<string, string> },
  ): Promise<{ httpStatus: number; body: T }> {
    const token = this.options_.apiToken
    if (!token) {
      throw new SePayApiError("SEPAY_API_TOKEN chưa được cấu hình.", 0, null)
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(init?.headers ?? {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    })

    let parsed: unknown = null
    const text = await res.text()
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }

    if (!res.ok) {
      const msg =
        (parsed as { message?: string } | null)?.message ??
        `SePay API ${init?.method ?? "GET"} ${path} failed (HTTP ${res.status})`
      throw new SePayApiError(msg, res.status, parsed)
    }
    return { httpStatus: res.status, body: parsed as T }
  }

  /** GET /v2/bank-accounts — smoke test kết nối/token (dùng cho admin ping). */
  async ping(): Promise<boolean> {
    await this.request(`/bank-accounts`)
    return true
  }

  /** GET /v2/bank-accounts/{ba}/terminals — VCB cần `tid` khi tạo VA order. */
  async listTerminals(): Promise<Terminal[]> {
    const { body } = await this.request<{
      status: string
      data: Terminal[]
    }>(`/bank-accounts/${this.bankAccountId}/terminals`)
    return body?.data ?? []
  }

  /**
   * Trả về tid dùng cho createVaOrder: option SEPAY_TID nếu set,
   * không thì terminal đầu tiên (lưu cache — chỉ gọi API một lần/boot).
   */
  async resolveTid(): Promise<string> {
    if (this.options_.tid) return this.options_.tid
    if (this.tidCache_) return this.tidCache_
    const terminals = await this.listTerminals()
    const first = terminals[0]?.tid
    if (!first) {
      throw new SePayApiError(
        "Không có terminal nào (Vietcombank yêu cầu tid khi tạo VA theo đơn hàng).",
        0,
        null,
      )
    }
    this.tidCache_ = first
    return first
  }

  /**
   * Tìm đơn VA theo order_code (idempotency cho lần gọi lại authorize).
   * Danh sách sắp xếp mới-nhất-trước, 100 bản ghi/trang — order_code sinh
   * từ session vừa tạo nên luôn nằm trong trang đầu (quy mô demo).
   */
  async findOrderByCode(orderCode: string): Promise<SePayOrder | null> {
    const { body } = await this.request<{
      status: string
      data: SePayOrder[]
    }>(`/bank-accounts/${this.bankAccountId}/orders?page=1&per_page=100`)
    const want = orderCode.toUpperCase()
    return body?.data?.find((o) => o.order_code?.toUpperCase() === want) ?? null
  }

  async getOrder(orderXid: string): Promise<SePayOrder> {
    const { body } = await this.request<{
      status: string
      data: SePayOrder
    }>(`/bank-accounts/${this.bankAccountId}/orders/${orderXid}`)
    return body.data
  }

  /**
   * POST /v2/bank-accounts/{ba}/orders — tạo VA theo đơn hàng.
   * `with_qrcode: "1"` → response kèm qr_code (base64) + qr_code_url.
   */
  async createVaOrder(input: {
    amount: number
    order_code: string
  }): Promise<SePayOrder> {
    const tid = await this.resolveTid()
    const { body } = await this.request<{
      status: string
      data: SePayOrder
    }>(`/bank-accounts/${this.bankAccountId}/orders`, {
      method: "POST",
      body: {
        amount: input.amount,
        order_code: input.order_code,
        tid,
        with_qrcode: "1",
      },
    })
    return body.data
  }

  /** DELETE /v2/bank-accounts/{ba}/orders/{xid} — chỉ hủy được đơn Pending (204). */
  async cancelOrder(orderXid: string): Promise<void> {
    await this.request(`/bank-accounts/${this.bankAccountId}/orders/${orderXid}`, {
      method: "DELETE",
    })
  }

  /**
   * POST /v2/bank-accounts/{ba}/orders/{xid}/refund — hoàn tiền theo đơn VA.
   *
   * Bắt buộc `X-Idempotency-Key` (SePay trả 422 nếu thiếu): gửi lại **cùng
   * khóa** trả về đúng bản ghi cũ thay vì chi tiền lần hai. Bỏ `refund_amount`
   * = hoàn toàn bộ phần còn lại; truyền vào = hoàn một phần.
   *
   * Hiện chỉ áp dụng **VietinBank doanh nghiệp**; ngân hàng khác trả
   * 422 `unsupported_bank`, tài khoản chưa bật trả 422 `not_available`.
   */
  async refundVaOrder(input: {
    orderXid: string
    idempotencyKey: string
    refundAmount?: number
  }): Promise<SePayRefund> {
    const { body } = await this.request<{ status: string; data: SePayRefund }>(
      `/bank-accounts/${this.bankAccountId}/orders/${input.orderXid}/refund`,
      {
        method: "POST",
        headers: { "X-Idempotency-Key": input.idempotencyKey },
        body:
          input.refundAmount === undefined
            ? {}
            : { refund_amount: input.refundAmount },
      },
    )
    return body.data
  }

  /** GET /v2/bank-accounts/{ba}/refunds/{refund_id} — tra trạng thái lệnh hoàn. */
  async getRefund(refundId: string): Promise<SePayRefund> {
    const { body } = await this.request<{ status: string; data: SePayRefund }>(
      `/bank-accounts/${this.bankAccountId}/refunds/${refundId}`,
    )
    return body.data
  }
}

/**
 * QR tĩnh (mode static_code): VietQR sinh ảnh QR điền sẵn
 * số tài khoản + số tiền + nội dung = mã thanh toán.
 * (Mẫu: https://vietqr.app/img?acc=&bank=&amount=&des=)
 */
export const buildVietQrUrl = (input: {
  accountNumber: string
  bank: string
  amount: number
  content: string
}): string => {
  const params = new URLSearchParams({
    acc: input.accountNumber,
    bank: input.bank,
    amount: String(input.amount),
    des: input.content,
  })
  return `https://vietqr.app/img?${params.toString()}`
}
