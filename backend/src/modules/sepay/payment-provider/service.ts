import crypto from "node:crypto"
import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import { isOrderCodeConflict, SePayApiError, SePayClient, type SePayOrder } from "../client"
import { verifySePayRequest, type SePayWebhookPayload } from "../webhook"

/**
 * Payment provider SePay (`pp_sepay`).
 *
 * Luồng: khách chọn "Chuyển khoản ngân hàng (SePay)" → `initiatePayment`
 * (không gọi API, chỉ ghi session_id + amount) → khách đặt hàng →
 * `authorizePayment` tạo **VA theo đơn hàng** trên SePay (idempotent qua
 * `order_code` dẫn xuất từ session id) và trả `authorized` kèm QR/VA number
 * trong session data → khách chuyển tiền → webhook SePay (S2) →
 * `getWebhookActionAndData` trả action `captured` → Medusa capture.
 *
 * Container của một payment provider chỉ chứa 6 dependency dùng chung
 * (manager / config / logger / pg_connection / event_bus / caching) —
 * KHÔNG có service của module khác (đã kiểm tra trong source
 * `@medusajs/modules-sdk` load-internal.js). Vì vậy việc dò payment session
 * từ webhook dùng map trong RAM (nhanh, cùng process) + fallback query
 * thẳng qua knex `pg_connection` (sống sót qua restart), không resolve
 * payment module service từ cradle.
 */

export type SePayProviderOptions = {
  /** Token API SePay (64 ký tự). Sandbox và Live không dùng chung token. */
  api_token?: string
  /** `https://userapi.sepay.vn/v2` (Live) hoặc `https://userapi-sandbox.sepay.vn/v2` (Test). */
  base_url?: string
  bank_account_id?: string
  /** Terminal Vietcombank — bắt buộc với VCB khi tạo VA theo đơn hàng. */
  tid?: string
  /** Secret HMAC do merchant đặt trong form tạo webhook của SePay. */
  webhook_secret?: string
  /** API Key (phương thức "API Key" của SePay, header `Authorization: Apikey ...`). */
  webhook_api_key?: string
  /** `va_order` (mặc định, VA riêng cho từng đơn) — chế độ khác chưa hỗ trợ. */
  mode?: string
}

type InjectedDependencies = {
  logger?: Logger
  /** knex (pg) — shared connection của mọi module. */
  __pg_connection__?: {
    raw(sql: string, bindings?: unknown[]): Promise<unknown>
  }
}

type SessionRef = { session_id: string; amount: number }

/** payment provider id cố định (config không khai báo `id` → key = `pp_sepay`). */
export const SEPAY_PROVIDER_ID = "pp_sepay"

const ORDER_CODE_PREFIX = "DH"
const ORDER_CODE_LENGTH = 8
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/**
 * `order_code` = `DH` + 8 ký tự base36 uppercase lấy từ sha256(session_id).
 *
 * Bắt buộc `^[a-zA-Z0-9]{6,15}$` (VCB) và phải **dẫn xuất được** từ session
 * id để lần gọi `authorize` thứ hai (retry/race) tái sử dụng đúng đơn VA
 * thay vì tạo VA mới. Session id là ULID → va chạm không thực tế trong demo.
 *
 * `nonce` mặc định 0 (giữ nguyên mã cũ). SePay **không cho tái sử dụng**
 * `order_code` đã tồn tại (kể cả đơn đã hủy) — khi cần tạo VA mới cho cùng
 * session (đổi số tiền, VA hết hạn) truyền `nonce` khác (vd `Date.now()`)
 * để sinh mã mới.
 */
export const deriveOrderCode = (sessionId: string, nonce: number | string = 0): string => {
  const hex = crypto
    .createHash("sha256")
    .update(`sepay:${sessionId}:${nonce}`)
    .digest("hex")
  let n = BigInt(`0x${hex.slice(0, 16)}`) // 64 bit entropy
  let out = ""
  for (let i = 0; i < ORDER_CODE_LENGTH; i++) {
    out = BASE36[Number(n % 36n)] + out
    n /= 36n
  }
  return `${ORDER_CODE_PREFIX}${out}`
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  if (typeof value === "string") return Number(value)
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return Number((value as { value: unknown }).value)
  }
  return NaN
}

const toBuffer = (raw: Buffer | string | undefined): Buffer => {
  if (!raw) return Buffer.alloc(0)
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8")
}

export class SePayPaymentProvider extends AbstractPaymentProvider<SePayProviderOptions> {
  static identifier = "sepay"

  static validateOptions(options: SePayProviderOptions) {
    if (!options?.api_token) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SePay: thiếu `api_token` (SEPAY_API_TOKEN) trong cấu hình provider.",
      )
    }
    if (!options.bank_account_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "SePay: thiếu `bank_account_id` (SEPAY_BANK_ACCOUNT_ID) trong cấu hình provider.",
      )
    }
    if (options.mode && options.mode !== "va_order") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `SePay: mode "${options.mode}" chưa được hỗ trợ — chỉ có "va_order".`,
      )
    }
  }

  protected logger_: Logger | undefined
  protected client_: SePayClient
  /**
   * Map tham chiếu (va_number / order_code → payment session) trong RAM.
   * Webhook đến cùng process sau khi `authorizePayment` chạy → tra nhanh,
   * không đụng DB. Restart thì rơi về query knex ở `lookupRef_`.
   */
  protected refs_ = new Map<string, SessionRef>()

  constructor(container: InjectedDependencies, options: SePayProviderOptions) {
    super(container, options)
    this.logger_ = container?.logger
    this.client_ = new SePayClient({
      apiToken: options.api_token,
      baseUrl: options.base_url,
      bankAccountId: options.bank_account_id,
      tid: options.tid,
      logger: container?.logger,
    })
  }

  // ── helpers ──────────────────────────────────────────────────────────

  protected log_(level: "info" | "warn" | "error", message: string) {
    const logger = this.logger_ ?? (console as unknown as Logger)
    logger[level]?.(message)
  }

  protected sessionId_(input: { data?: Record<string, unknown>; context?: unknown }): string {
    const data = input.data ?? {}
    const ctx = input.context as { idempotency_key?: string } | undefined
    const id = (data.session_id as string) || ctx?.idempotency_key
    if (!id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "SePay: không tìm thấy payment session id trong context.",
      )
    }
    return id
  }

  protected remember_(key: "va" | "code", value: string, ref: SessionRef) {
    if (value) this.refs_.set(`${key}:${value.toUpperCase()}`, ref)
  }

  protected recall_(key: "va" | "code", value: string): SessionRef | undefined {
    if (!value) return undefined
    return this.refs_.get(`${key}:${value.toUpperCase()}`)
  }

  protected get knex_() {
    const c = this.container as unknown as InjectedDependencies
    return c?.__pg_connection__
  }

  /**
   * Dò payment session của `pp_sepay` theo va_number (chính) hoặc order_code
   * (dự phòng) — query JSONB trên `payment_session.data`.
   */
  protected async lookupRef_(
    vaNumber?: string,
    orderCode?: string,
  ): Promise<SessionRef | null> {
    const hit = this.recall_("va", vaNumber ?? "") ?? this.recall_("code", orderCode ?? "")
    if (hit) return hit

    const knex = this.knex_
    if (!knex) {
      this.log_("error", "SePay: không resolve được pg_connection để dò payment session.")
      return null
    }
    try {
      const sql = `
        SELECT id, amount FROM payment_session
        WHERE provider_id = ?
          AND (
            (? <> '' AND data->>'sepay_va_number' = ?)
            OR (? <> '' AND UPPER(data->>'sepay_order_code') = UPPER(?))
          )
        ORDER BY created_at DESC
        LIMIT 1`
      const va = vaNumber ?? ""
      const code = orderCode ?? ""
      const result = (await knex.raw(sql, [SEPAY_PROVIDER_ID, va, va, code, code])) as {
        rows?: Array<{ id: string; amount: string | number }>
      }
      const row = result?.rows?.[0]
      if (!row) return null
      const ref = { session_id: row.id, amount: Number(row.amount) }
      if (va) this.remember_("va", va, ref)
      if (code) this.remember_("code", code, ref)
      return ref
    } catch (err) {
      this.log_("error", `SePay: lỗi query payment_session — ${(err as Error).message}`)
      return null
    }
  }

  /** Tìm đơn VA hiện có theo order_code (idempotency) — null nếu chưa có. */
  protected async findExistingOrder_(
    orderCode: string,
    amount: number,
  ): Promise<SePayOrder | null> {
    try {
      const existing = await this.client_.findOrderByCode(orderCode)
      if (!existing) return null
      if (existing.status === "Cancelled") return null
      if (Number(existing.amount) === amount) return existing
      // Số tiền đơn cũ không còn khớp (cart đổi trước khi authorize) → hủy đơn cũ
      try {
        await this.client_.cancelOrder(existing.id)
      } catch {
        /* đơn đã Paid/Partially → bỏ qua, create sẽ báo lỗi rõ ràng */
      }
      return null
    } catch (err) {
      // Chưa có đơn / API lỗi mạng → cứ thử tạo mới (order_code deterministic)
      this.log_(
        "warn",
        `SePay: không tra được đơn VA theo order_code ${orderCode} — ${(err as Error).message}`,
      )
      return null
    }
  }

  /** Field lưu vào session data từ một đơn VA SePay (VA/QR/bank/expiry). */
  protected vaFieldsFromOrder_(order: SePayOrder): Record<string, unknown> {
    return {
      sepay_order_xid: order.id,
      sepay_va_number: order.va?.[0]?.va_number ?? order.va_number ?? null,
      sepay_qr_code: order.qr_code ?? null,
      sepay_qr_code_url: order.qr_code_url ?? null,
      sepay_expired_at: order.expired_at ?? order.va?.[0]?.expired_at ?? null,
      sepay_va_holder_name:
        order.va?.[0]?.va_holder_name ?? order.account_holder_name ?? null,
      sepay_bank_name: order.bank_name ?? null,
      sepay_account_number: order.account_number ?? null,
    }
  }

  /**
   * Tạo đơn VA mới an toàn với ràng buộc `order_code` của SePay: nếu mã đã
   * tồn tại (kể cả đơn đã hủy — SePay **không** cho tái sử dụng) thì sinh mã
   * mới từ `sessionId` + nonce thời gian rồi thử lại. Trả về đơn + mã đã dùng.
   */
  protected async createVaOrderSafe_(
    sessionId: string,
    amount: number,
    baseCode: string,
  ): Promise<{ order: SePayOrder; orderCode: string }> {
    try {
      const order = await this.client_.createVaOrder({ amount, order_code: baseCode })
      return { order, orderCode: baseCode }
    } catch (err) {
      if (!isOrderCodeConflict(err)) throw err
      const orderCode = deriveOrderCode(sessionId, Date.now())
      this.log_(
        "warn",
        `SePay: order_code ${baseCode} đã tồn tại — thử mã mới ${orderCode}.`,
      )
      const order = await this.client_.createVaOrder({ amount, order_code: orderCode })
      return { order, orderCode }
    }
  }

  /**
   * Tái tạo VA mới cho một session (VA cũ hết hạn): hủy VA cũ (best-effort)
   * rồi tạo đơn mới với `order_code` mới. Trả về đơn + mã đơn.
   */
  protected async regenerateVa_(
    sessionId: string,
    amount: number,
    previousXid?: unknown,
  ): Promise<{ order: SePayOrder; orderCode: string }> {
    if (previousXid && this.client_.configured) {
      try {
        await this.client_.cancelOrder(String(previousXid))
      } catch (err) {
        this.log_(
          "warn",
          `SePay: không hủy được VA cũ ${String(previousXid)} khi tái tạo — ${(err as Error).message}`,
        )
      }
    }
    const created = await this.createVaOrderSafe_(
      sessionId,
      amount,
      deriveOrderCode(sessionId, Date.now()),
    )
    const ref: SessionRef = { session_id: sessionId, amount }
    this.remember_("code", created.orderCode, ref)
    const vaNumber = created.order.va?.[0]?.va_number ?? created.order.va_number ?? null
    if (vaNumber) this.remember_("va", vaNumber, ref)
    return created
  }

  // ── IPaymentProvider ─────────────────────────────────────────────────
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const sessionId = this.sessionId_(input)
    const amount = toNumber(input.amount)
    const currency = String(input.currency_code ?? "").toUpperCase()

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "SePay: số tiền không hợp lệ.")
    }
    if (currency !== "VND") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `SePay chỉ hỗ trợ VND — nhận được "${input.currency_code}".`,
      )
    }

    const orderCode = deriveOrderCode(sessionId)
    this.remember_("code", orderCode, { session_id: sessionId, amount })

    return {
      id: sessionId,
      status: PaymentSessionStatus.PENDING,
      data: {
        session_id: sessionId,
        amount,
        currency_code: currency,
        sepay_order_code: orderCode,
      },
    }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const data = { ...(input.data ?? {}) }

    // Storefront yêu cầu tái tạo VA (VA cũ đã hết hạn): hủy VA cũ, tạo đơn
    // mới với `order_code` mới rồi trả data đã cập nhật. Không tái tạo khi
    // đã thu tiền.
    if (data.sepay_regenerate) {
      delete data.sepay_regenerate
      const sessionId = this.sessionId_(input)
      const regenAmount = Number(toNumber(input.amount) || toNumber(data.amount) || 0)
      if (this.client_.configured && regenAmount > 0 && !data.sepay_captured_at) {
        const { order, orderCode } = await this.regenerateVa_(
          sessionId,
          regenAmount,
          data.sepay_order_xid,
        )
        return {
          data: {
            ...data,
            session_id: sessionId,
            amount: regenAmount,
            sepay_order_code: orderCode,
            sepay_regenerated_at: new Date().toISOString(),
            ...this.vaFieldsFromOrder_(order),
          },
        }
      }
    }

    const amount = toNumber(input.amount)
    if (Number.isFinite(amount) && amount > 0) {
      data.amount = amount
      // đơn VA (nếu đã tạo) mang số tiền cũ → dọn để authorize tạo lại đúng số tiền
      if (data.sepay_va_number) {
        delete data.sepay_va_number
        delete data.sepay_order_xid
        delete data.sepay_qr_code
        delete data.sepay_qr_code_url
        delete data.sepay_expired_at
        // SePay không cho tái dùng order_code → bỏ luôn để authorize sinh mã mới
        delete data.sepay_order_code
      }
      const sessionId = this.sessionId_(input)
      const orderCode = deriveOrderCode(sessionId)
      this.remember_("code", orderCode, { session_id: sessionId, amount })
    }
    return { data }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    // Session bị bỏ (khách đổi phương thức thanh toán) → hủy VA đang Pending
    const data = (input.data ?? {}) as { sepay_order_xid?: string }
    if (data.sepay_order_xid && this.client_.configured) {
      try {
        await this.client_.cancelOrder(String(data.sepay_order_xid))
      } catch (err) {
        this.log_(
          "warn",
          `SePay: không hủy được VA order ${data.sepay_order_xid} khi xóa session — ${(err as Error).message}`,
        )
      }
    }
    return { data: {} }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const data = { ...(input.data ?? {}) }
    const sessionId = this.sessionId_(input)
    // AuthorizePaymentInput không mang amount — số tiền do initiatePayment ghi
    // vào session data (Medusa truyền nguyên `session.data` vào đây).
    const amount = Number(data.amount ?? 0)
    const orderCode = String(data.sepay_order_code || deriveOrderCode(sessionId))

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "SePay: session data thiếu số tiền — không authorize được (hãy tạo lại payment session).",
      )
    }

    if (!this.client_.configured) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "SePay chưa được cấu hình (SEPAY_API_TOKEN / SEPAY_BANK_ACCOUNT_ID).",
      )
    }

    // Idempotency: đơn VA đã tồn tại đúng số tiền → tái sử dụng (khách refresh
    // trang / Medusa gọi lại authorize / race với webhook). Nếu mã đơn bị trùng
    // (SePay không cho tái dùng) thì `createVaOrderSafe_` tự sinh mã mới.
    const reused = await this.findExistingOrder_(orderCode, amount)
    let order: SePayOrder
    let finalCode = orderCode
    if (reused) {
      order = reused
    } else {
      const created = await this.createVaOrderSafe_(sessionId, amount, orderCode)
      order = created.order
      finalCode = created.orderCode
    }

    const vaNumber = order.va?.[0]?.va_number ?? order.va_number ?? null
    const ref: SessionRef = { session_id: sessionId, amount }
    this.remember_("code", finalCode, ref)
    if (vaNumber) this.remember_("va", vaNumber, ref)

    const merged: Record<string, unknown> = {
      ...data,
      session_id: sessionId,
      amount,
      sepay_order_code: finalCode,
      ...this.vaFieldsFromOrder_(order),
    }

    // Tiền chưa về (khách vừa nhận QR) → `authorized` để đơn được tạo ngay;
    // capture chạy khi webhook SePay xác nhận đã nhận đủ tiền.
    return { data: merged, status: PaymentSessionStatus.AUTHORIZED }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const data = (input.data ?? {}) as Record<string, unknown>
    if (data.sepay_captured_at) return { status: PaymentSessionStatus.CAPTURED }
    if (data.sepay_cancelled_at) return { status: PaymentSessionStatus.CANCELED }
    if (!this.client_.configured || !data.sepay_order_code) {
      return { status: PaymentSessionStatus.PENDING }
    }

    try {
      const order = await this.client_.findOrderByCode(String(data.sepay_order_code))
      if (!order) return { status: PaymentSessionStatus.PENDING }
      if (order.status === "Cancelled") return { status: PaymentSessionStatus.CANCELED }
      const paid = Number(order.paid_amount ?? 0)
      const amount = Number(data.amount ?? 0)
      if (order.status === "Paid" && paid >= amount && amount > 0) {
        return { status: PaymentSessionStatus.AUTHORIZED }
      }
      if (order.status === "Partially") return { status: PaymentSessionStatus.PENDING }
      return { status: PaymentSessionStatus.PENDING }
    } catch (err) {
      this.log_(
        "warn",
        `SePay: không lấy được trạng thái đơn ${String(data.sepay_order_code)} — ${(err as Error).message}`,
      )
      return { status: PaymentSessionStatus.PENDING }
    }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const data = { ...((input.data ?? {}) as Record<string, unknown>) }
    if (data.sepay_captured_at) {
      return { data } // idempotent — webhook replay / capture gọi lại
    }

    // CHẶN dùng API SePay làm chốt ở đây: route webhook đã verify HMAC +
    // số tiền khớp session, và webhook chỉ fire khi SePay thật sự ghi nhận
    // giao dịch. Webhook tới TRƯỚC khi orders API phản ánh `Paid` (propagation
    // ~vài giây, và sandbox không có tiền thật) — bắt buộc `Paid` ở đây sẽ
    // làm capture fail vĩnh viễn vì route đã trả 200 nên SePay không resend.
    // Log mức warn để đối soát nếu trạng thái bên SePay mâu thuẫn.
    if (this.client_.configured && data.sepay_order_xid) {
      try {
        const order = await this.client_.getOrder(String(data.sepay_order_xid))
        const paid = Number(order?.paid_amount ?? 0)
        const amount = Number(data.amount ?? 0)
        if (order && order.status !== "Paid" && order.status !== "Partially") {
          this.log_(
            "warn",
            `SePay: capture theo webhook nhưng đơn ${String(data.sepay_order_xid)} ` +
              `tại SePay đang "${order.status}" (paid=${paid}/${amount}) — kiểm tra đối soát.`,
          )
        }
      } catch {
        /* API không phản hồi — vẫn capture theo webhook, không chặn đơn */
      }
    }

    return { data: { ...data, sepay_captured_at: new Date().toISOString() } }
  }

  /**
   * Hoàn tiền — **Hybrid**:
   *
   *  1. Thử API hoàn tiền SePay (`POST .../orders/{xid}/refund`) khi client đã
   *     cấu hình + đã tạo VA order + đã thu tiền. Kèm `X-Idempotency-Key`
   *     (lấy từ context Medusa, hoặc sinh tất định) để không chi tiền 2 lần.
   *  2. Nếu SePay trả `unsupported_bank` / `not_available` (ngân hàng chưa hỗ
   *     trợ — API hoàn tiền hiện chỉ áp dụng **VietinBank doanh nghiệp**), thì
   *     **ghi nhận hoàn tiền thủ công** vào Medusa kèm ghi chú; nhân viên tự
   *     chuyển khoản trong app ngân hàng/SePay.
   *  3. Lỗi khác (mạng, 500, idempotency...) thì **ném lỗi, KHÔNG ghi nhận** —
   *     tránh đánh dấu "đã hoàn" khi tiền có thể đã/đang đi.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const data = { ...((input.data ?? {}) as Record<string, unknown>) }
    const amount = toNumber(input.amount)
    const orderXid = data.sepay_order_xid ? String(data.sepay_order_xid) : undefined

    // Idempotency key ≤100 ký tự; ưu tiên key Medusa cung cấp (tất định cho
    // đúng lệnh hoàn này), nếu không thì dẫn xuất từ session + số tiền.
    const idempotencyKey = String(
      input.context?.idempotency_key ??
        `medusa-${String(data.session_id ?? "sepay")}-${Number.isFinite(amount) ? amount : "full"}`,
    ).slice(0, 100)

    if (this.client_.configured && orderXid && data.sepay_captured_at) {
      try {
        const refund = await this.client_.refundVaOrder({
          orderXid,
          idempotencyKey,
          refundAmount: Number.isFinite(amount) ? Math.round(amount) : undefined,
        })
        this.log_(
          "info",
          `SePay: đã tạo lệnh hoàn tiền ${refund.refund_id} ` +
            `(${refund.amount}₫, ${refund.status}) cho đơn ${orderXid}.`,
        )
        return {
          data: {
            ...data,
            sepay_refund_id: refund.refund_id,
            sepay_refund_status: refund.status,
            sepay_refund_mode: "api",
            sepay_refunded_at: new Date().toISOString(),
          },
        }
      } catch (err) {
        const apiErr = err as SePayApiError
        const code = (apiErr.body as { error_code?: string } | null)?.error_code
        if (code === "unsupported_bank" || code === "not_available") {
          this.log_(
            "warn",
            `SePay: API hoàn tiền không hỗ trợ cho tài khoản này (${code}) — ` +
              `ghi nhận hoàn tiền thủ công, nhân viên chuyển khoản tay.`,
          )
          // rơi xuống nhánh ghi nhận thủ công bên dưới
        } else {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            `SePay: gọi API hoàn tiền thất bại (${code ?? apiErr.message}). ` +
              `CHƯA ghi nhận hoàn tiền — kiểm tra my.sepay.vn rồi thử lại ` +
              `(lệnh gửi lại cùng khóa idempotency sẽ không chi tiền lần hai).`,
          )
        }
      }
    }

    // Ghi nhận thủ công: Medusa đánh dấu đã hoàn, việc chuyển tiền làm bên ngoài.
    const reason = !data.sepay_captured_at
      ? "chưa ghi nhận tiền vào"
      : orderXid
        ? "ngân hàng chưa hỗ trợ API hoàn tiền (chỉ VietinBank doanh nghiệp)"
        : "không có đơn VA để hoàn qua API"
    return {
      data: {
        ...data,
        sepay_refund_mode: "manual",
        sepay_refund_note:
          `Hoàn tiền thủ công (${reason}): chuyển khoản trong app ngân hàng/SePay ` +
          `rồi đối soát.`,
        sepay_refunded_at: new Date().toISOString(),
      },
    }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: { ...((input.data ?? {}) as Record<string, unknown>) } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const data = { ...((input.data ?? {}) as Record<string, unknown>) }
    if (data.sepay_captured_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "SePay: giao dịch đã nhận tiền — không hủy được, hãy dùng hoàn tiền thủ công.",
      )
    }
    if (data.sepay_order_xid && this.client_.configured && !data.sepay_cancelled_at) {
      try {
        await this.client_.cancelOrder(String(data.sepay_order_xid))
      } catch (err) {
        // Đơn đã hết hạn / đã hủy / đã Paid → không chặn luồng cancel của Medusa
        this.log_(
          "warn",
          `SePay: hủy VA order ${String(data.sepay_order_xid)} thất bại — ${(err as Error).message}`,
        )
      }
    }
    return { data: { ...data, sepay_cancelled_at: new Date().toISOString() } }
  }

  /**
   * Xử lý webhook (gọi qua subscriber Medusa `payment.webhook_received`).
   *
   * Route webhook (S2) đã verify + dedup trước; ở đây verify lại lần nữa
   * (pattern của Stripe — provider không bao giờ tin payload thô) rồi dò
   * session, đối chiếu số tiền, trả action `captured`.
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const raw = toBuffer(payload?.rawData)
    const verify = verifySePayRequest({
      rawBody: raw,
      headers: payload?.headers,
      hmacSecret: this.config.webhook_secret,
      apiKey: this.config.webhook_api_key,
    })
    if (!verify.valid) {
      this.log_(
        "warn",
        `SePay webhook bị từ chối — chữ ký không hợp lệ (${verify.reason ?? "unknown"}).`,
      )
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const body = (payload?.data ?? {}) as SePayWebhookPayload
    if (String(body.transferType ?? "").toLowerCase() === "out") {
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const vaNumber = String(body.subAccount ?? "").trim()
    const code = String(body.code ?? "").trim()
    const transferAmount = Number(body.transferAmount)
    if ((!vaNumber && !code) || !Number.isFinite(transferAmount) || transferAmount <= 0) {
      this.log_(
        "warn",
        "SePay webhook bỏ qua — payload thiếu va_number/mã đơn hoặc số tiền không hợp lệ.",
      )
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    const ref = await this.lookupRef_(vaNumber, code)
    if (!ref) {
      this.log_(
        "warn",
        `SePay webhook không khớp payment session nào (va=${vaNumber || "-"}, code=${code || "-"}).`,
      )
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    if (transferAmount !== Number(ref.amount)) {
      this.log_(
        "warn",
        `SePay webhook số tiền không khớp: nhận ${transferAmount}, đơn yêu cầu ${ref.amount} ` +
          `(session ${ref.session_id}) — không capture.`,
      )
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    return {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: ref.session_id, amount: ref.amount },
    }
  }
}

export default SePayPaymentProvider
