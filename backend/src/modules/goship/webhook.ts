import crypto from "crypto"

/**
 * Xác thực + diễn giải webhook GoShip.
 *
 * GoShip ký mỗi request bằng header `x-goship-hmac-sha256` =
 * `base64(HMAC_SHA256(rawBody, GOSHIP_CLIENT_SECRET))` (xem doc
 * https://doc.goship.io/api/shipment/webhooks). Vì chữ ký tính trên **body
 * thô**, route webhook phải bật `preserveRawBody` trong `middlewares.ts`.
 *
 * File này chỉ chứa hàm thuần để unit-test không cần HTTP/DB.
 */

/** Payload sự kiện "Cập nhật trạng thái vận đơn" của GoShip. */
export type GoshipWebhookPayload = {
  /** Mã đơn GoShip. */
  gcode?: string
  /** Mã vận đơn của hãng vận chuyển. */
  code?: string
  /** Mã đơn phía đối tác — ta gửi id order Medusa. */
  order_id?: string
  weight?: string | number
  fee?: string | number
  cod?: string | number
  /** 0 = khách trả, 1 = shop trả. */
  payer?: string | number
  /** Mã trạng thái (900..1000). */
  status?: string | number
  status_text?: string
  message?: string
  tracking_url?: string
  description?: string
  sorting_code?: string
  return_sorting_code?: string
  /** 0/1 */
  is_return?: string | number
  /** 0/1 */
  is_part_delivery?: string | number
  /** 0/1 */
  is_lost?: string | number
  carrier_short_name?: string
  amount_return_shop?: number
  /** UNIX timestamp (GMT+7). */
  update_time?: number
  [k: string]: unknown
}

const toBuffer = (body: Buffer | string | undefined): Buffer => {
  if (!body) return Buffer.alloc(0)
  return Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8")
}

/** `base64(HMAC-SHA256(rawBody, secret))`. */
export function computeGoshipSignature(
  rawBody: Buffer | string | undefined,
  secret: string,
): string {
  return crypto.createHmac("sha256", secret).update(toBuffer(rawBody)).digest("base64")
}

/**
 * So khớp chữ ký theo kiểu hằng thời gian. Trả `false` khi thiếu secret/header
 * để fail-closed (không bao giờ chấp nhận request không xác thực).
 */
export function verifyGoshipRequest(
  rawBody: Buffer | string | undefined,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false
  const expected = computeGoshipSignature(rawBody, secret)
  const expectedBuf = Buffer.from(expected)
  const receivedBuf = Buffer.from(String(header))
  if (expectedBuf.length !== receivedBuf.length) return false
  try {
    return crypto.timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

/** Cờ 0/1 (chuỗi hay số) → boolean. */
export function toFlag(value: unknown): boolean {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false
  return Number(String(value).trim()) === 1
}

/** Giai đoạn giao hàng suy ra từ mã trạng thái GoShip. */
export type GoshipStatusPhase =
  | "created"
  | "shipped"
  | "delivered"
  | "returning"
  | "canceled"
  | "failed"
  | "unknown"

export type GoshipStatusMapping = {
  status: string
  phase: GoshipStatusPhase
  /** Đặt `fulfillment.shipped_at`. */
  shipped: boolean
  /** Đặt `fulfillment.delivered_at`. */
  delivered: boolean
  /** Đặt `fulfillment.canceled_at`. */
  canceled: boolean
}

const mapping = (
  status: string,
  phase: GoshipStatusPhase,
  flags: Partial<Pick<GoshipStatusMapping, "shipped" | "delivered" | "canceled">> = {},
): GoshipStatusMapping => ({
  status,
  phase,
  shipped: flags.shipped ?? false,
  delivered: flags.delivered ?? false,
  canceled: flags.canceled ?? false,
})

/**
 * Bảng ánh xạ mã trạng thái GoShip → giai đoạn vận đơn + mốc thời gian cần ghi
 * vào fulfillment. Order `fulfillment_status` của Medusa được TÍNH LẠI từ
 * `packed_at/shipped_at/delivered_at/canceled_at`, nên chỉ cần đặt đúng mốc.
 */
export const GOSHIP_STATUS_MAP: Record<string, GoshipStatusMapping> = {
  "900": mapping("900", "created"), // Đơn mới
  "901": mapping("901", "created"), // Chờ lấy hàng
  "902": mapping("902", "created"), // Lấy hàng
  "903": mapping("903", "shipped", { shipped: true }), // Đã lấy hàng
  "904": mapping("904", "shipped", { shipped: true }), // Giao hàng
  "905": mapping("905", "delivered", { delivered: true }), // Giao thành công
  "906": mapping("906", "failed"), // Giao thất bại
  "907": mapping("907", "returning"), // Đang chuyển hoàn
  "908": mapping("908", "returning"), // Chuyển hoàn
  "909": mapping("909", "delivered", { delivered: true }), // Đã đối soát
  "910": mapping("910", "delivered", { delivered: true }), // Đã đối soát khách
  "911": mapping("911", "delivered", { delivered: true }), // Đã trả COD
  "912": mapping("912", "delivered", { delivered: true }), // Chờ thanh toán COD
  "913": mapping("913", "delivered", { delivered: true }), // Hoàn thành
  "914": mapping("914", "canceled", { canceled: true }), // Đơn hủy
  "915": mapping("915", "created"), // Chậm lấy/giao
  "916": mapping("916", "delivered", { delivered: true }), // Giao hàng một phần
  "917": mapping("917", "failed"), // Thất lạc hàng
  "918": mapping("918", "created"), // Đang lưu kho
  "919": mapping("919", "shipped", { shipped: true }), // Đang vận chuyển
  "1000": mapping("1000", "failed"), // Đơn lỗi
}

/** Tra mapping; mã lạ → `unknown` (không đặt mốc nào). */
export function mapGoshipStatus(status: unknown): GoshipStatusMapping {
  const key = String(status ?? "").trim()
  return GOSHIP_STATUS_MAP[key] ?? mapping(key, "unknown")
}
