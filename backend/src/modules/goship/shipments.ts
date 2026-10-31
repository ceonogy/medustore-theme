/**
 * Hàm thuần dựng payload `POST /shipments` từ dữ liệu Medusa.
 *
 * Tách khỏi provider để unit-test không cần Medusa/GoShip thật.
 */
import type { GoshipShipmentContact, GoshipShipmentParcel } from "./client"
import { GOSHIP_GOODS_TYPE_MAX, isKnownGoodsType } from "./config"
import { buildParcel, type ParcelDefaults, type RateItem } from "./rates"

const clean = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim()

/** Họ tên đầy đủ từ first/last (bỏ phần rỗng). */
export function fullName(first?: unknown, last?: unknown): string {
  return [clean(first), clean(last)].filter(Boolean).join(" ")
}

/** Ghép `address_1` (+ `address_2`) thành một dòng `street` của GoShip. */
export function streetLine(address: Record<string, unknown> | null | undefined): string {
  return [clean(address?.address_1), clean(address?.address_2)]
    .filter(Boolean)
    .join(", ")
}

/** Dạng tối thiểu của một địa chỉ Medusa dùng để dựng contact GoShip. */
export type ContactInput = {
  name?: string | null
  phone?: string | null
  street?: string | null
  email?: string | null
}

/** Địa chỉ 3 cấp dạng mã số. */
export type GeoAddress = {
  city: string | number
  district: string | number
  ward: string | number
}

/**
 * Dựng contact GoShip (người gửi/nhận): thông tin liên hệ + mã địa giới 3 cấp.
 * `fallbackName` dùng khi thiếu tên (GoShip bắt buộc có `name`).
 */
export function buildShipmentContact(
  contact: ContactInput,
  geo: GeoAddress,
  fallbackName = "Khách hàng",
): GoshipShipmentContact {
  const email = clean(contact.email)
  return {
    name: clean(contact.name) || fallbackName,
    phone: clean(contact.phone),
    street: clean(contact.street),
    city: geo.city,
    district: geo.district,
    ward: geo.ward,
    ...(email ? { email } : {}),
  }
}

/** Thông tin điểm gửi mặc định (từ ENV) khi option không khai báo. */
export type OriginDefaults = {
  name: string
  phone: string
  street: string
}

/**
 * Liên hệ điểm gửi: ưu tiên `data.address_from` của shipping option (do script
 * đồng bộ ghi), rơi về mặc định ENV. Mã địa giới do `coerceGoshipAddress` lo.
 */
export function resolveOriginContact(
  optionData: Record<string, unknown> | undefined,
  defaults: OriginDefaults,
): OriginDefaults {
  const raw = (optionData?.address_from ?? {}) as Record<string, unknown>
  return {
    name: clean(raw.name) || defaults.name,
    phone: clean(raw.phone) || defaults.phone,
    street: clean(raw.street) || clean(raw.address) || defaults.street,
  }
}

/** Dựng kiện hàng cho `/shipments` (thêm COD + giá trị khai báo). */
export function buildShipmentParcel(
  items: RateItem[] | undefined,
  defaults: ParcelDefaults,
  options: { cod?: number; amount?: number; metadata?: string } = {},
): GoshipShipmentParcel {
  const base = buildParcel(items, defaults)
  const nonNegative = (value: unknown): number => {
    const num = Number(value)
    return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
  }
  const metadata = clean(options.metadata)
  return {
    cod: nonNegative(options.cod),
    amount: nonNegative(options.amount),
    weight: base.weight,
    width: base.width,
    height: base.height,
    length: base.length,
    ...(metadata ? { metadata } : {}),
  }
}

/**
 * Chuẩn hoá `tracking_number` GoShip: giá trị `"NULL"`/rỗng nghĩa là hãng chưa
 * cấp mã (kết quả thật đến qua webhook) → trả `null`.
 */
export function normalizeTrackingNumber(value: unknown): string | null {
  const str = clean(value)
  if (!str || str.toUpperCase() === "NULL") return null
  return str
}

/**
 * Gom "Loại hàng" từ các item (đã giải mã từ variant/product metadata), khử
 * trùng, giữ thứ tự, tối đa `max` (mặc định = giới hạn GoShip). Chỉ nhận giá
 * trị có trong danh mục — giá trị lạ bị bỏ (đã cảnh báo ở provider). Mỗi item
 * có thể khai NHIỀU loại. Không item nào khai → dùng `fallback` (mặc định).
 */
export function collectGoodsTypes(
  items: RateItem[] | undefined,
  fallback: string[] = [],
  max = GOSHIP_GOODS_TYPE_MAX,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []

  const push = (value: unknown): boolean => {
    const name = clean(value)
    if (!isKnownGoodsType(name) || seen.has(name)) return false
    seen.add(name)
    out.push(name)
    return out.length >= max
  }

  for (const item of items ?? []) {
    for (const name of item?.goodsTypes ?? []) {
      if (push(name)) return out
    }
  }
  if (out.length) return out

  for (const name of fallback) {
    if (push(name)) break
  }
  return out
}

/**
 * Ghép `parcel.metadata` từ các mục dạng text (vì API GoShip chỉ có 1 chuỗi):
 * `[loại hàng] · [giao 1 phần] · [ghi chú giao hàng] · [ghi chú chung]`.
 * Rỗng → `undefined`.
 */
export function composeParcelMetadata(parts: {
  goodsTypes?: string[]
  deliveryNote?: string | null
  note?: string | null
  partDelivery?: boolean
}): string | undefined {
  const segments: string[] = []
  const goods = (parts.goodsTypes ?? []).map((g) => clean(g)).filter(Boolean)
  if (goods.length) segments.push(`Loại hàng: ${goods.join(", ")}`)
  if (parts.partDelivery) segments.push("Giao 1 phần")
  const note = clean(parts.deliveryNote)
  if (note) segments.push(note)
  const general = clean(parts.note)
  if (general) segments.push(general)
  return segments.length ? segments.join(" · ") : undefined
}
