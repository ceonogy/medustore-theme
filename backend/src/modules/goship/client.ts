import type { Logger } from "@medusajs/framework/types"

/**
 * HTTP client cho GoShip Open API v2 (https://doc.goship.io/getting-started/introduction).
 *
 *  - Auth: `Authorization: Bearer <access_token>` (token sống ~10 năm, lấy
 *    từ tài khoản developer GoShip). Sandbox và production KHÔNG dùng chung
 *    token — token sandbox gọi api.goship.io sẽ trả 401.
 *  - Base URL:
 *      Sandbox: https://sandbox.goship.io/api/v2
 *      Prod:    https://api.goship.io/api/v2
 *  - Mọi response theo envelope `{ code, status, data }`; status != "success"
 *    hoặc code != 200 → ném GoshipApiError.
 *  - Timeout 12s/req, KHÔNG tự retry (các call tạo vận đơn có thể gọi lại an
 *    toàn bằng `order_id`, và caller cần thấy lỗi thật để xử lý).
 */

export type GoshipClientOptions = {
  token?: string
  baseUrl?: string
  logger?: Logger
  /** Timeout ms cho mỗi request (mặc định 12000). */
  timeoutMs?: number
}

export class GoshipApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = "GoshipApiError"
    this.status = status
    this.body = body
  }
}

export type GoshipProvince = {
  id: string | number
  name: string
  support_carriers?: string[] | null
}

export type GoshipDistrict = {
  id: string | number
  name: string
  city_id: string | number
  support_carriers?: string[] | null
}

export type GoshipWard = {
  id: string | number
  name: string
  district_id: string | number
  support_carriers?: string[] | null
}

/** Địa chỉ 3 cấp dạng mã số GoShip (dùng cho /rates, /shipments). */
export type GoshipAddress = {
  city: string | number
  district: string | number
  ward: string | number
}

/** Kiện hàng: cân nặng gram + kích thước cm + tiền thu hộ (COD). */
export type GoshipParcel = {
  weight: number
  length?: number
  width?: number
  height?: number
  /** Tiền thu hộ (VND). >0 nếu đơn COD. */
  cod?: number
}

export type GoshipRateRequest = {
  shipment: {
    address_from: GoshipAddress
    address_to: GoshipAddress
    parcel: GoshipParcel
  }
}

/** Một báo giá của hãng vận chuyển từ POST /rates. */
export type GoshipRate = {
  id: string
  carrier_name: string
  carrier_short_name: string
  carrier_logo?: string
  service: string
  expected: string
  total_fee: number
  location_fee?: number
  service_fee?: number
  cod_fee?: number
  promotion_id?: number
  discount?: number
  [k: string]: unknown
}

/** Liên hệ gửi/nhận trong POST /shipments (đã có mã địa giới 3 cấp). */
export type GoshipShipmentContact = {
  name: string
  phone: string
  street: string
  ward: string | number
  district: string | number
  city: string | number
  email?: string
}

/** Kiện hàng trong POST /shipments (gram + cm). */
export type GoshipShipmentParcel = {
  /** Tiền thu hộ (VND) — 0 nếu đã trả trước. */
  cod?: number
  /** Giá trị hàng khai báo (VND) — 0 = không bảo hiểm. */
  amount?: number
  weight: number
  width?: number
  height?: number
  length?: number
  metadata?: string
}

export type GoshipShipmentRequest = {
  shipment: {
    /** `rate.id` lấy từ POST /rates (đúng hãng + dịch vụ đã báo giá). */
    rate: string
    /** Mã đối tác — ta gửi id order Medusa để webhook dò ngược. */
    order_id: string
    /** 0 = khách trả phí, 1 = shop trả phí. */
    payer: 0 | 1
    /** 0 = đơn thường, 1 = đơn thu hồi (chỉ BestExpress). */
    is_recall?: 0 | 1
    address_from: GoshipShipmentContact
    address_to: GoshipShipmentContact
    parcel: GoshipShipmentParcel
  }
}

/**
 * Kết quả POST /shipments. Lưu ý GoShip trả các trường này ở **gốc** envelope
 * (không nằm trong `data`), và `tracking_number` có thể là `"NULL"` cho tới khi
 * hãng cấp mã thật (kết quả cuối cùng đến qua webhook).
 */
export type GoshipShipment = {
  id: string
  shipment_status: number
  shipment_status_txt: string
  cod: number
  fee: number
  is_recall?: number
  tracking_number?: string
  carrier?: string
  carrier_short_name?: string
  sorting_code?: string
  return_sorting_code?: string
  amount_return_shop?: number
  created_at?: string
  /** Thông tin lỗi khi tạo đơn (khi `shipment_status = 900`). */
  carrier_error?: unknown
  [k: string]: unknown
}

/** Một đăng ký webhook trên dashboard GoShip. */
export type GoshipWebhookSubscription = {
  id: number
  event: string
  endpoint: string
  created_at?: string
  updated_at?: string
}

/** Response chung của GoShip. */
type GoshipEnvelope<T> = {
  code: number
  status: string
  data?: T
  message?: string
}

const DEFAULT_BASE_URL = "https://sandbox.goship.io/api/v2"

export class GoshipClient {
  private readonly token?: string
  private readonly baseUrl: string
  private readonly logger?: Logger
  private readonly timeoutMs: number

  constructor(options: GoshipClientOptions = {}) {
    this.token = options.token
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.logger = options.logger
    this.timeoutMs = options.timeoutMs ?? 12_000
  }

  /** Access token đã cấu hình (để route/healthcheck biết đã set chưa). */
  hasToken(): boolean {
    return Boolean(this.token && this.token.trim())
  }

  private async requestEnvelope<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<(GoshipEnvelope<T> & Record<string, unknown>) | undefined> {
    if (!this.token) {
      throw new GoshipApiError("Thiếu GOSHIP_TOKEN", 0, null)
    }
    const { json, headers, ...rest } = init
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
          Authorization: `Bearer ${this.token}`,
          ...(headers as Record<string, string> | undefined),
        },
        body: json !== undefined ? JSON.stringify(json) : (rest.body as BodyInit | null | undefined),
      })
    } catch (err) {
      clearTimeout(timer)
      const aborted = (err as { name?: string })?.name === "AbortError"
      throw new GoshipApiError(
        aborted ? `GoShip timeout sau ${this.timeoutMs}ms` : `GoShip request lỗi: ${String(err)}`,
        0,
        err,
      )
    }
    clearTimeout(timer)

    const text = await res.text()
    let parsed: (GoshipEnvelope<T> & Record<string, unknown>) | undefined
    try {
      parsed = text ? (JSON.parse(text) as GoshipEnvelope<T> & Record<string, unknown>) : undefined
    } catch {
      parsed = undefined
    }

    if (!res.ok) {
      throw new GoshipApiError(
        `GoShip HTTP ${res.status}`,
        res.status,
        parsed ?? text,
      )
    }
    if (parsed && (parsed.code !== 200 || parsed.status !== "success")) {
      throw new GoshipApiError(
        parsed.message || `GoShip lỗi ${parsed.code}`,
        parsed.code,
        parsed,
      )
    }
    return parsed
  }

  /** Gọi API và trả `data` của envelope (mặc định cho hầu hết endpoint). */
  private async request<T>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const parsed = await this.requestEnvelope<T>(path, init)
    return (parsed?.data ?? (parsed as unknown)) as T
  }

  /** GET /cities — 63 tỉnh/thành (không phân trang). */
  async getCities(): Promise<GoshipProvince[]> {
    return (await this.request<GoshipProvince[]>("/cities")) ?? []
  }

  /** GET /cities/{code}/districts — quận/huyện của một tỉnh/thành. */
  async getDistricts(cityCode: string | number): Promise<GoshipDistrict[]> {
    return (await this.request<GoshipDistrict[]>(`/cities/${cityCode}/districts`)) ?? []
  }

  /** GET /districts/{code}/wards — phường/xã của một quận/huyện. */
  async getWards(districtCode: string | number): Promise<GoshipWard[]> {
    return (await this.request<GoshipWard[]>(`/districts/${districtCode}/wards`)) ?? []
  }

  /**
   * POST /rates — báo giá cước của các hãng GoShip cho một kiện hàng.
   *
   * GoShip trả về MẢNG rate (mỗi hãng/dịch vụ một phần tử), đã gồm phí cuối
   * `total_fee` (VND) và thời gian dự kiến `expected`. Caller tự chọn rate
   * theo tier (rẻ nhất / nhanh nhất) — xem `rates.ts`.
   */
  async getRates(input: GoshipRateRequest): Promise<GoshipRate[]> {
    const data = await this.request<GoshipRate[]>("/rates", {
      method: "POST",
      json: input,
    })
    return Array.isArray(data) ? data : []
  }

  /**
   * POST /shipments — tạo vận đơn GoShip.
   *
   * GoShip trả `HTTP 200` kể cả khi tạo thất bại (bất đồng bộ): kết quả thật
   * đến qua webhook. Response có các trường vận đơn ở **gốc** envelope (cạnh
   * `code`/`status`/`data`) nên phải bóc tách thủ công.
   */
  async createShipment(input: GoshipShipmentRequest): Promise<GoshipShipment> {
    const envelope = await this.requestEnvelope<unknown>("/shipments", {
      method: "POST",
      json: input,
    })
    if (!envelope) {
      throw new GoshipApiError("GoShip /shipments trả rỗng", 0, null)
    }
    const { code: _code, status: _status, data: _data, message: _message, ...shipment } =
      envelope
    return shipment as unknown as GoshipShipment
  }

  /** GET /shipments/search?code=… — tra vận đơn theo gcode / order_id / mã hãng. */
  async searchShipment(code: string): Promise<GoshipShipment[]> {
    const data = await this.request<GoshipShipment[]>(
      `/shipments/search?code=${encodeURIComponent(code)}`,
    )
    return Array.isArray(data) ? data : []
  }

  /** DELETE /shipments/{id} — hủy vận đơn (id = gcode). */
  async cancelShipment(id: string): Promise<void> {
    await this.request<unknown>(`/shipments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  }

  /** GET /webhooks — danh sách endpoint đã đăng ký. */
  async listWebhooks(): Promise<GoshipWebhookSubscription[]> {
    const data = await this.request<GoshipWebhookSubscription[]>("/webhooks")
    return Array.isArray(data) ? data : []
  }

  /** POST /webhooks — đăng ký một endpoint nhận webhook. */
  async registerWebhook(endpoint: string): Promise<GoshipWebhookSubscription> {
    return this.request<GoshipWebhookSubscription>("/webhooks", {
      method: "POST",
      json: { endpoint },
    })
  }

  /** DELETE /webhooks/{id}. */
  async deleteWebhook(id: number | string): Promise<void> {
    await this.request<unknown>(`/webhooks/${id}`, { method: "DELETE" })
  }
}

export default GoshipClient
