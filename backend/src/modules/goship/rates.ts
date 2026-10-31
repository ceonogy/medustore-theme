/**
 * Hàm thuần (pure) dựng payload `/rates` và chọn rate theo tier.
 *
 * Tách khỏi provider để unit-test được mà không cần Medusa/GoShip thật.
 */
import type { GoshipAddress, GoshipParcel, GoshipRate, GoshipRateRequest } from "./client"
import {
  getGoshipTier,
  type DimensionUnit,
  type GoshipTier,
  type GoshipTierId,
  type WeightUnit,
} from "./config"

/** Khoá metadata lưu mã địa giới GoShip (đồng bộ với storefront + P1). */
export const META_CITY_CODE = "goship_city_code"
export const META_DISTRICT_CODE = "goship_district_code"
export const META_WARD_CODE = "goship_ward_code"

export type GeoCodes = {
  city: string
  district: string
  ward: string
}

const asCode = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  const str = String(value).trim()
  return str.length ? str : undefined
}

/**
 * Đọc mã 3 cấp GoShip từ metadata. Trả `null` nếu thiếu bất kỳ cấp nào —
 * GoShip bắt buộc đủ city/district/ward mới tính được cước.
 */
export function readGeoCodes(metadata: unknown): GeoCodes | null {
  if (!metadata || typeof metadata !== "object") return null
  const meta = metadata as Record<string, unknown>
  const city = asCode(meta[META_CITY_CODE])
  const district = asCode(meta[META_DISTRICT_CODE])
  const ward = asCode(meta[META_WARD_CODE])
  if (!city || !district || !ward) return null
  return { city, district, ward }
}

/** Địa chỉ GoShip (mã số) từ metadata. */
export function toGoshipAddress(metadata: unknown): GoshipAddress | null {
  const codes = readGeoCodes(metadata)
  if (!codes) return null
  return { city: codes.city, district: codes.district, ward: codes.ward }
}

/** Ép một object `{city,district,ward}` (số hoặc chuỗi) thành GoshipAddress. */
export function coerceGoshipAddress(value: unknown): GoshipAddress | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const city = asCode(raw.city)
  const district = asCode(raw.district)
  const ward = asCode(raw.ward)
  if (!city || !district || !ward) return null
  return { city, district, ward }
}

/**
 * Xác định điểm gửi (`address_from`):
 *  1. `data.address_from` của shipping option — nguồn chính, do script đồng bộ
 *     ghi theo kho; workflow tính giá KHÔNG trả `metadata` của stock location
 *     nên không thể dựa vào đó.
 *  2. `metadata` của stock location (`from_location`) — dự phòng.
 */
export function resolveOriginAddress(
  optionData: unknown,
  fromLocationMetadata: unknown,
): GoshipAddress | null {
  const data = optionData && typeof optionData === "object" ? (optionData as Record<string, unknown>) : undefined
  return coerceGoshipAddress(data?.address_from) ?? toGoshipAddress(fromLocationMetadata)
}

/** Kích thước/khối lượng mặc định cho kiện hàng (gram + cm). */
export type ParcelDefaults = {
  /** Cân nặng mặc định, tính theo `weightUnit` (không phải luôn là gram). */
  weightGrams: number
  length: number
  width: number
  height: number
  /**
   * Đơn vị của các giá trị trên (và của variant) — Medusa lưu số trần nên shop
   * tự khai đơn vị. Mặc định `g`/`cm` (GoShip). Xem `config.ts`.
   */
  weightUnit?: WeightUnit
  dimensionUnit?: DimensionUnit
}

export const DEFAULT_PARCEL: ParcelDefaults = {
  weightGrams: 500,
  length: 20,
  width: 15,
  height: 10,
  weightUnit: "g",
  dimensionUnit: "cm",
}

/** Item tối thiểu cần để tính kiện (khớp CartLineItemDTO). */
export type RateItem = {
  quantity?: number | null
  variant?: {
    weight?: number | null
    length?: number | null
    width?: number | null
    height?: number | null
  } | null
  /** Các loại hàng GoShip đã giải mã cho item (từ variant/product metadata). */
  goodsTypes?: string[] | null
}

const positive = (value: unknown, fallback: number): number => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

/**
 * Gộp item thành 1 kiện: cộng khối lượng, lấy max dài/rộng, cộng dồn cao
 * (xếp chồng). Thiếu dữ liệu → dùng mặc định để luôn có con số hợp lệ.
 *
 * **Quy đổi đơn vị**: Medusa lưu cân nặng/kích thước là số trần theo đơn vị shop
 * khai (`weightUnit`/`dimensionUnit`). GoShip chỉ nhận gram + cm, nên nhân hệ số
 * ngay tại đây — áp cho **cả giá trị variant lẫn giá trị mặc định**.
 */
export function buildParcel(
  items: RateItem[] | undefined,
  defaults: ParcelDefaults = DEFAULT_PARCEL,
): GoshipParcel {
  const weightFactor = (defaults.weightUnit ?? "g") === "kg" ? 1000 : 1
  const dimensionFactor = (defaults.dimensionUnit ?? "cm") === "m" ? 100 : 1

  let weight = 0
  let length = 0
  let width = 0
  let height = 0

  for (const item of items ?? []) {
    const qty = positive(item?.quantity, 1)
    const variant = item?.variant ?? {}
    weight += positive(variant.weight, defaults.weightGrams) * qty
    length = Math.max(length, positive(variant.length, defaults.length))
    width = Math.max(width, positive(variant.width, defaults.width))
    height += positive(variant.height, defaults.height) * qty
  }

  return {
    weight: Math.ceil((weight > 0 ? weight : defaults.weightGrams) * weightFactor),
    length: Math.ceil((length > 0 ? length : defaults.length) * dimensionFactor),
    width: Math.ceil((width > 0 ? width : defaults.width) * dimensionFactor),
    height: Math.ceil((height > 0 ? height : defaults.height) * dimensionFactor),
  }
}

/** Dựng payload POST /rates. */
export function buildRateRequest(
  from: GoshipAddress,
  to: GoshipAddress,
  parcel: GoshipParcel,
): GoshipRateRequest {
  return { shipment: { address_from: from, address_to: to, parcel } }
}

/** Số ngày dự kiến parse từ `expected` (vd "Dự kiến giao 3 ngày" → 3). */
export function expectedDays(expected: unknown): number | null {
  if (typeof expected !== "string") return null
  const match = expected.match(/(\d+)\s*(?:[-–—]|đến)?\s*(\d+)?\s*ngày/i)
  if (!match) return null
  const first = Number(match[1])
  const second = match[2] ? Number(match[2]) : first
  if (!Number.isFinite(first)) return null
  return Number.isFinite(second) ? Math.max(first, second) : first
}

/**
 * Chọn 1 rate cho tier:
 *  - `cheapest`: `total_fee` nhỏ nhất.
 *  - `fastest`: số ngày dự kiến nhỏ nhất, đồng hạng thì rẻ hơn thắng.
 * Trả `null` nếu danh sách rỗng / không có `total_fee` hợp lệ.
 */
export function selectRate(rates: GoshipRate[] | undefined, tier: GoshipTier): GoshipRate | null {
  const usable = (rates ?? []).filter((rate) => Number.isFinite(Number(rate?.total_fee)))
  if (!usable.length) return null

  return usable.reduce((best, rate) => {
    if (tier.strategy === "fastest") {
      const days = expectedDays(rate.expected) ?? Number.POSITIVE_INFINITY
      const bestDays = expectedDays(best.expected) ?? Number.POSITIVE_INFINITY
      if (days !== bestDays) return days < bestDays ? rate : best
      return Number(rate.total_fee) < Number(best.total_fee) ? rate : best
    }
    return Number(rate.total_fee) < Number(best.total_fee) ? rate : best
  })
}

/** Chọn rate theo service id của tier (tiện cho provider). */
export function selectRateForService(
  rates: GoshipRate[] | undefined,
  service: GoshipTierId,
): GoshipRate | null {
  const tier = getGoshipTier(service)
  return tier ? selectRate(rates, tier) : null
}

/** Bản rút gọn của rate lưu vào `data` của shipping method (cho P3). */
export type RateSummary = {
  rate_id: string
  carrier: string
  carrier_short_name: string
  service: string
  expected: string
  total_fee: number
}

export function toRateSummary(rate: GoshipRate): RateSummary {
  return {
    rate_id: String(rate.id),
    carrier: String(rate.carrier_name ?? ""),
    carrier_short_name: String(rate.carrier_short_name ?? ""),
    service: String(rate.service ?? ""),
    expected: String(rate.expected ?? ""),
    total_fee: Number(rate.total_fee),
  }
}
