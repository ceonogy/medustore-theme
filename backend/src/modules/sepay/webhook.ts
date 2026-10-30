import crypto from "node:crypto"

/**
 * Xác thực webhook SePay theo spec:
 * https://developer.sepay.vn/vi/sepay-api/v2 (mục Webhook / xác thực chữ ký).
 *
 *   X-SePay-Signature:  sha256=<hex>
 *   X-SePay-Timestamp:  <epoch>
 *
 *   signed content = `${timestamp}.${raw_body}`
 *   signature       = HMAC-SHA256(webhook_secret, signed content)
 *
 * Cửa sổ ±5 phút so với đồng hồ hiện tại (chống replay chữ ký cũ).
 * So sánh bằng timingSafeEqual để không rò rỉ thời gian qua lỗi so khớp.
 *
 * Dùng cả ở route webhook (S2 — verify sớm trước khi ghi log/emit event) và
 * trong payment provider (`getWebhookActionAndData`) — theo đúng pattern của
 * Stripe: provider tự verify lại một lần nữa, route trả `{"success":true}`
 * cho SePay.
 */

export const SEPAY_SIGNATURE_HEADER = "x-sepay-signature"
export const SEPAY_TIMESTAMP_HEADER = "x-sepay-timestamp"
export const SEPAY_AUTHORIZATION_HEADER = "authorization"
export const SEPAY_API_KEY_PREFIX = "Apikey "
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000

/** Payload webhook giao dịch của SePay (một transfer vào tài khoản). */
export type SePayWebhookPayload = {
  id?: number | string
  gateway?: string
  transactionDate?: string
  accountNumber?: string
  /** Số tài khoản ảo (VA) nhận tiền — dùng để dò payment session. */
  subAccount?: string
  /** Mã đơn hàng (= order_code khi tạo VA theo đơn hàng). */
  code?: string
  content?: string
  transferType?: string
  transferAmount?: number
  accumulated?: number
  referenceCode?: string
}

export type VerifyResult = {
  valid: boolean
  reason?:
    | "missing_secret"
    | "missing_signature"
    | "bad_signature_format"
    | "missing_timestamp"
    | "bad_timestamp"
    | "stale_timestamp"
    | "missing_auth_header"
    | "bad_auth_format"
    | "mismatch"
}

export type VerifyRequestResult = {
  valid: boolean
  /** Phương thức đã xác thực thành công (để log/đối soát). */
  via?: "hmac" | "api_key"
  reason?: VerifyResult["reason"]
}

const headerValue = (
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined => {
  if (!headers) return undefined
  const raw = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === undefined || v === null ? undefined : String(v)
}

/** Epoch (giây hoặc mili giây) → ms. */
const toEpochMs = (value: string): number | null => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  // epochs tính bằng giây nằm quanh 1e9, bằng ms nằm quanh 1e12
  return n < 1e11 ? n * 1000 : n
}

export const verifySePaySignature = (input: {
  rawBody: Buffer | string
  headers?: Record<string, unknown>
  secret?: string | null
  toleranceMs?: number
  now?: number
}): VerifyResult => {
  const { rawBody, headers, secret } = input
  const tolerance = input.toleranceMs ?? DEFAULT_TOLERANCE_MS

  if (!secret) return { valid: false, reason: "missing_secret" }

  const signature = headerValue(headers, SEPAY_SIGNATURE_HEADER)
  if (!signature) return { valid: false, reason: "missing_signature" }
  if (!/^sha256=[0-9a-fA-F]{64}$/.test(signature)) {
    return { valid: false, reason: "bad_signature_format" }
  }

  const timestamp = headerValue(headers, SEPAY_TIMESTAMP_HEADER)
  if (!timestamp) return { valid: false, reason: "missing_timestamp" }
  const tsMs = toEpochMs(timestamp)
  if (tsMs === null) return { valid: false, reason: "bad_timestamp" }

  const now = input.now ?? Date.now()
  if (Math.abs(now - tsMs) > tolerance) return { valid: false, reason: "stale_timestamp" }

  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8")
  const signedContent = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw])
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex")}`

  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature, "utf8")
  if (a.length !== b.length) return { valid: false, reason: "mismatch" }
  if (!crypto.timingSafeEqual(a, b)) return { valid: false, reason: "mismatch" }

  return { valid: true }
}

/**
 * Xác thực bằng API Key — SePay gửi `Authorization: Apikey <key>`
 * (phương thức "API Key" ở bước Bảo mật khi tạo webhook).
 * So sánh constant-time, cắt đúng tiền tố `Apikey `.
 */
export const verifySePayApiKey = (input: {
  headers?: Record<string, unknown>
  apiKey?: string | null
}): VerifyResult => {
  if (!input.apiKey) return { valid: false, reason: "missing_secret" }

  const auth = headerValue(input.headers, SEPAY_AUTHORIZATION_HEADER)
  if (!auth) return { valid: false, reason: "missing_auth_header" }
  if (!auth.startsWith(SEPAY_API_KEY_PREFIX)) {
    return { valid: false, reason: "bad_auth_format" }
  }

  const provided = auth.slice(SEPAY_API_KEY_PREFIX.length)
  const a = Buffer.from(provided, "utf8")
  const b = Buffer.from(input.apiKey, "utf8")
  if (a.length !== b.length) return { valid: false, reason: "mismatch" }
  if (!crypto.timingSafeEqual(a, b)) return { valid: false, reason: "mismatch" }

  return { valid: true }
}

/**
 * Xác thực request webhook theo **bất kỳ** phương thức nào merchant đã cấu
 * hình trên my.sepay.vn (form chỉ cho chọn MỘT): HMAC-SHA256 hoặc API Key.
 *
 * Thứ tự: HMAC trước (nếu có header chữ ký) vì bảo vệ cả payload; nếu
 * request không mang chữ ký hợp lệ thì thử API Key. Không cấu hình gì →
 * từ chối (fail-closed).
 */
export const verifySePayRequest = (input: {
  rawBody: Buffer | string
  headers?: Record<string, unknown>
  hmacSecret?: string | null
  apiKey?: string | null
  toleranceMs?: number
  now?: number
}): VerifyRequestResult => {
  const hasSignatureHeader =
    headerValue(input.headers, SEPAY_SIGNATURE_HEADER) !== undefined

  if (input.hmacSecret && (hasSignatureHeader || !input.apiKey)) {
    const hmac = verifySePaySignature({
      rawBody: input.rawBody,
      headers: input.headers,
      secret: input.hmacSecret,
      toleranceMs: input.toleranceMs,
      now: input.now,
    })
    if (hmac.valid) return { valid: true, via: "hmac" }
    if (!input.apiKey) return { valid: false, reason: hmac.reason }
    // có API key dự phòng → thử tiếp
  }

  if (input.apiKey) {
    const key = verifySePayApiKey({ headers: input.headers, apiKey: input.apiKey })
    if (key.valid) return { valid: true, via: "api_key" }
    return { valid: false, reason: key.reason }
  }

  return {
    valid: false,
    reason: input.hmacSecret ? "missing_signature" : "missing_secret",
  }
}
