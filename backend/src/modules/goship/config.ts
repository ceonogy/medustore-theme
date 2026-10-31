/**
 * Cấu hình "bật/tắt GoShip" + định nghĩa tier giao hàng.
 *
 * Triết lý (quyết định của chủ shop):
 *  - **Mặc định = giá ship cố định**: 2 shipping option `flat` native
 *    ("Giao hàng tiêu chuẩn"/"Giao hàng nhanh", provider `manual_manual`).
 *  - **GoShip = plugin chỉ để TÍNH cước**, có thể bật/tắt. Khi TẮT thì mọi
 *    shipping option của GoShip bị ẩn ở checkout, chỉ còn option flat.
 *
 * Cờ bật/tắt đọc từ `GOSHIP_ENABLED` **lúc gọi** (không cache ở module scope)
 * → sửa `.env` rồi restart là đủ, không cần build lại. Giá trị mặc định là
 * TẮT để hành vi "giá cố định" là mặc định an toàn.
 */

/** True/false dạng chuỗi — khớp kiểu context mà Medusa validate rule `eq`. */
export type GoshipFlag = "true" | "false"

/** Attribute của rule ẩn option GoShip khi provider bị tắt. */
export const GOSHIP_RULE_ATTRIBUTE = "goship_enabled"

/** Map bool → chuỗi cờ dùng cho context/rule. */
export function goshipFlagValue(enabled: boolean): GoshipFlag {
  return enabled ? "true" : "false"
}

const TRUTHY = new Set(["true", "1", "yes", "on", "enabled"])

/** Khoá cấu hình trong bảng `goship_setting` (Admin UI ghi vào đây). */
export const GOSHIP_SETTING_KEY = "enabled"

/**
 * GoShip có đang bật không — **giá trị dự phòng từ ENV**.
 *
 * Đây chỉ còn là fallback: nguồn chính là bảng `goship_setting` do Admin UI
 * điều khiển (xem `settings.ts` / `service.ts`). Mặc định **false** để hành vi
 * "giá ship cố định" là mặc định an toàn.
 */
export function isGoshipEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.GOSHIP_ENABLED ?? "").trim().toLowerCase()
  return TRUTHY.has(raw)
}

/**
 * Parse một giá trị bất kỳ thành bool theo cùng bộ từ khoá. Giá trị rỗng /
 * null → trả `fallback` (để phân biệt "chưa set" với "set = false").
 */
export function parseGoshipEnabled(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined || value === "") return fallback
  return TRUTHY.has(String(value).trim().toLowerCase())
}

/** Mức phí dự phòng (VND) khi không gọi được `/rates` để không chặn checkout. */
export function goshipFallbackFee(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.GOSHIP_FALLBACK_FEE ?? 30000)
  return Number.isFinite(raw) && raw > 0 ? raw : 30000
}

/** Cách chọn 1 rate trong danh sách GoShip trả về. */
export type GoshipTierStrategy = "cheapest" | "fastest"

export type GoshipTierId = "economy" | "express"

export type GoshipTier = {
  /** Trùng `id` trong `FulfillmentOption` của provider. */
  id: GoshipTierId
  /** Tên hiển thị ở checkout. */
  name: string
  description: string
  strategy: GoshipTierStrategy
}

/**
 * 2 tier giao hàng (quyết định B ở P0). Mỗi tier = 1 shipping option
 * `calculated` trỏ tới provider `goship`.
 */
export const GOSHIP_TIERS: readonly GoshipTier[] = [
  {
    id: "economy",
    name: "Tiết kiệm",
    description: "Giao tiêu chuẩn — cước thấp nhất trong các hãng GoShip",
    strategy: "cheapest",
  },
  {
    id: "express",
    name: "Nhanh",
    description: "Giao nhanh nhất — chọn hãng có thời gian giao ngắn nhất",
    strategy: "fastest",
  },
] as const

export function getGoshipTier(id: unknown): GoshipTier | undefined {
  const key = typeof id === "string" ? id : undefined
  return GOSHIP_TIERS.find((tier) => tier.id === key)
}

/** Chuẩn hoá service id từ `optionData` (admin lưu `service` hoặc `id`). */
export function resolveGoshipService(optionData: Record<string, unknown> | undefined): GoshipTierId {
  const candidate = optionData?.service ?? optionData?.id
  return getGoshipTier(candidate)?.id ?? "economy"
}

// ── Cấu hình "Thông tin hàng gửi" (parcel) ──────────────────────────────
//
// Form tạo đơn tay của GoShip có nhiều tuỳ chọn (loại hàng, người trả phí,
// ghi chú giao hàng, khai giá, giao 1 phần...). API `POST /shipments` chỉ nhận
// `parcel.{cod,amount,weight,width,height,length,metadata}` + `shipment.payer`,
// nên các mục dạng text được GỘP vào `parcel.metadata`.
//
// Lưu trong bảng key/value `goship_setting` để Admin UI chỉnh sau deploy.

/** Khoá `goship_setting` cho từng tuỳ chọn kiện hàng. */
export const GOSHIP_PARCEL_KEYS = {
  payer: "parcel_payer",
  deliveryNote: "parcel_delivery_note",
  goodsTypes: "parcel_goods_types",
  declareValue: "parcel_declare_value",
  weight: "parcel_weight_grams",
  length: "parcel_length_cm",
  width: "parcel_width_cm",
  height: "parcel_height_cm",
  cod: "parcel_cod_default",
  partDelivery: "parcel_is_part_delivery",
  weightUnit: "parcel_weight_unit",
  dimensionUnit: "parcel_dimension_unit",
} as const

/**
 * Đơn vị shop nhập ở Medusa. **Medusa không có cấu hình đơn vị** cho
 * `product/variant.weight|length|width|height` (đều là số `float` trần) — nên
 * đây là quy ước riêng của shop, lưu trong `goship_setting`.
 *
 * GoShip chỉ nhận **gram + cm**, nên khi gửi API ta quy đổi từ đơn vị này sang
 * g/cm (`buildParcel`). Không cần hiển thị giá trị đã đổi.
 */
export type WeightUnit = "g" | "kg"
export type DimensionUnit = "cm" | "m"

/** Lựa chọn đơn vị cho form Admin. */
export const GOSHIP_WEIGHT_UNITS = [
  { id: "g", label: "gram (g)" },
  { id: "kg", label: "kilogram (kg)" },
] as const

export const GOSHIP_DIMENSION_UNITS = [
  { id: "cm", label: "xentimét (cm)" },
  { id: "m", label: "mét (m)" },
] as const

/** Danh mục "Loại hàng" — khớp checkbox của GoShip. */
export const GOSHIP_GOODS_TYPES = [
  "Quần áo",
  "Giày dép",
  "Balo túi",
  "Tài liệu",
  "Đồ điện tử",
  "Thực phẩm",
  "Mỹ phẩm",
  "Dược phẩm",
  "Đồ chơi",
  "Đồ dễ vỡ",
  "Trang sức",
] as const

/** GoShip giới hạn chọn tối đa 2 loại hàng. */
export const GOSHIP_GOODS_TYPE_MAX = 2

/**
 * Khoá metadata trên variant/product để khai "loại hàng".
 * Ưu tiên: `variant.metadata.goship_goods_type` → `product.metadata.goship_goods_type`.
 */
export const GOSHIP_GOODS_TYPE_META_KEY = "goship_goods_type"

/** "Ghi chú giao hàng" — preset của GoShip. */
export const GOSHIP_DELIVERY_NOTES = [
  { id: "allow_trial", label: "Cho thử hàng" },
  { id: "view_only", label: "Cho xem hàng, không cho thử" },
  { id: "no_view", label: "Không cho xem hàng" },
] as const

export type GoshipDeliveryNoteId = (typeof GOSHIP_DELIVERY_NOTES)[number]["id"]

/** Nhãn tiếng Việt của "Ghi chú giao hàng" (null nếu không đặt). */
export function goshipDeliveryNoteLabel(id: unknown): string | null {
  const key = typeof id === "string" ? id : ""
  return GOSHIP_DELIVERY_NOTES.find((n) => n.id === key)?.label ?? null
}

export type GoshipDeclareValue = "off" | "order_total"

export type GoshipParcelSettings = {
  /** 0 = khách trả phí, 1 = shop trả phí. */
  payer: 0 | 1
  /** Mã preset "Ghi chú giao hàng" (rỗng = không ghi). */
  deliveryNote: GoshipDeliveryNoteId | ""
  /** Loại hàng mặc định khi sản phẩm không khai (tối đa 2). */
  goodsTypes: string[]
  /** "order_total" = khai giá bằng tổng đơn; "off" = 0. */
  declareValue: GoshipDeclareValue
  weightGrams: number
  length: number
  width: number
  height: number
  /** COD mặc định khi đơn không có COD thật (VND). */
  cod: number
  /** Giao 1 phần (chỉ GHN/GHTK) — chỉ ghi chú vì API không có field. */
  partDelivery: boolean
  /**
   * Đơn vị của `weightGrams` và cân nặng variant (shop nhập). Quy đổi sang
   * gram khi gửi GoShip.
   */
  weightUnit: WeightUnit
  /** Đơn vị của dims mặc định + dims variant. Quy đổi sang cm khi gửi GoShip. */
  dimensionUnit: DimensionUnit
}

export const DEFAULT_PARCEL_SETTINGS: GoshipParcelSettings = {
  payer: 1,
  deliveryNote: "",
  goodsTypes: [],
  declareValue: "off",
  weightGrams: 500,
  length: 20,
  width: 15,
  height: 10,
  cod: 0,
  partDelivery: false,
  weightUnit: "g",
  dimensionUnit: "cm",
}

const parseBoolFlag = (value: unknown): boolean =>
  TRUTHY.has(String(value).trim().toLowerCase())

const toPositiveInt = (value: unknown, fallback: number): number => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback
}

/**
 * Loại hàng có nằm trong danh mục GoShip không? Dùng để lọc dữ liệu khai tự do
 * (metadata sản phẩm/variant) trước khi gửi GoShip — tránh giá trị sai chính tả.
 */
export function isKnownGoodsType(value: unknown): boolean {
  const name = String(value ?? "").trim()
  return Boolean(name) && (GOSHIP_GOODS_TYPES as readonly string[]).includes(name)
}

/** Chuẩn hoá danh sách loại hàng: chỉ nhận trong danh mục, khử trùng, tối đa 2. */
export function sanitizeGoodsTypes(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const name = String(item ?? "").trim()
    if (seen.has(name) || !isKnownGoodsType(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= GOSHIP_GOODS_TYPE_MAX) break
  }
  return out
}

/** Giá trị 0/1 (chuỗi/số) → payer. */
export function parsePayer(value: unknown, fallback: 0 | 1): 0 | 1 {
  const num = Number(value)
  if (num === 0) return 0
  if (num === 1) return 1
  return fallback
}

/** Chuẩn hoá đơn vị cân nặng shop nhập (`g` | `kg`). */
export function parseWeightUnit(value: unknown, fallback: WeightUnit = "g"): WeightUnit {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "kg" || raw === "g") return raw
  return fallback
}

/** Chuẩn hoá đơn vị kích thước shop nhập (`cm` | `m`). */
export function parseDimensionUnit(
  value: unknown,
  fallback: DimensionUnit = "cm",
): DimensionUnit {
  const raw = String(value ?? "").trim().toLowerCase()
  if (raw === "m" || raw === "cm") return raw
  return fallback
}

/**
 * Ghép các dòng `key/value` của `goship_setting` thành cấu hình kiện hàng.
 * `base` là giá trị mặc định (ENV/provider) — DB ghi đè khi có khoá.
 */
export function parseGoshipParcelSettings(
  values: Record<string, string | null | undefined>,
  base: GoshipParcelSettings = DEFAULT_PARCEL_SETTINGS,
): GoshipParcelSettings {
  const pick = (key: string): string | undefined => {
    const raw = values[key]
    return raw === null || raw === undefined ? undefined : String(raw)
  }

  const payerRaw = pick(GOSHIP_PARCEL_KEYS.payer)
  const deliveryRaw = pick(GOSHIP_PARCEL_KEYS.deliveryNote)
  const goodsRaw = pick(GOSHIP_PARCEL_KEYS.goodsTypes)
  const declareRaw = pick(GOSHIP_PARCEL_KEYS.declareValue)
  const partRaw = pick(GOSHIP_PARCEL_KEYS.partDelivery)
  const weightUnitRaw = pick(GOSHIP_PARCEL_KEYS.weightUnit)
  const dimensionUnitRaw = pick(GOSHIP_PARCEL_KEYS.dimensionUnit)

  return {
    payer: payerRaw === undefined ? base.payer : parsePayer(payerRaw, base.payer),
    deliveryNote:
      deliveryRaw === undefined
        ? base.deliveryNote
        : ((GOSHIP_DELIVERY_NOTES.find((n) => n.id === deliveryRaw)?.id ?? "") as
            | GoshipDeliveryNoteId
            | ""),
    goodsTypes:
      goodsRaw === undefined ? base.goodsTypes : sanitizeGoodsTypes(goodsRaw),
    declareValue:
      declareRaw === "order_total" || declareRaw === "off"
        ? declareRaw
        : base.declareValue,
    weightGrams: toPositiveInt(pick(GOSHIP_PARCEL_KEYS.weight), base.weightGrams),
    length: toPositiveInt(pick(GOSHIP_PARCEL_KEYS.length), base.length),
    width: toPositiveInt(pick(GOSHIP_PARCEL_KEYS.width), base.width),
    height: toPositiveInt(pick(GOSHIP_PARCEL_KEYS.height), base.height),
    cod: pick(GOSHIP_PARCEL_KEYS.cod) === undefined
      ? base.cod
      : Math.max(0, Math.round(Number(pick(GOSHIP_PARCEL_KEYS.cod)) || 0)),
    partDelivery: partRaw === undefined ? base.partDelivery : parseBoolFlag(partRaw),
    weightUnit:
      weightUnitRaw === undefined
        ? base.weightUnit
        : parseWeightUnit(weightUnitRaw, base.weightUnit),
    dimensionUnit:
      dimensionUnitRaw === undefined
        ? base.dimensionUnit
        : parseDimensionUnit(dimensionUnitRaw, base.dimensionUnit),
  }
}

/**
 * Giá trị nền cho cấu hình kiện hàng lấy từ ENV (DB ghi đè từng khoá sau).
 * Giữ tương thích ngược: trước đây payer/cân nặng/khai giá chỉ đọc từ ENV.
 */
export function goshipParcelBaseFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): GoshipParcelSettings {
  return {
    ...DEFAULT_PARCEL_SETTINGS,
    payer: parsePayer(env.GOSHIP_PAYER ?? 1, DEFAULT_PARCEL_SETTINGS.payer),
    weightGrams: toPositiveInt(
      env.GOSHIP_DEFAULT_WEIGHT_GRAMS,
      DEFAULT_PARCEL_SETTINGS.weightGrams,
    ),
    length: toPositiveInt(env.GOSHIP_DEFAULT_LENGTH_CM, DEFAULT_PARCEL_SETTINGS.length),
    width: toPositiveInt(env.GOSHIP_DEFAULT_WIDTH_CM, DEFAULT_PARCEL_SETTINGS.width),
    height: toPositiveInt(env.GOSHIP_DEFAULT_HEIGHT_CM, DEFAULT_PARCEL_SETTINGS.height),
    cod: Math.max(0, Math.round(Number(env.GOSHIP_COD_DEFAULT ?? 0) || 0)),
    partDelivery: parseBoolFlag(env.GOSHIP_PART_DELIVERY),
    weightUnit: parseWeightUnit(env.GOSHIP_WEIGHT_UNIT, DEFAULT_PARCEL_SETTINGS.weightUnit),
    dimensionUnit: parseDimensionUnit(
      env.GOSHIP_DIMENSION_UNIT,
      DEFAULT_PARCEL_SETTINGS.dimensionUnit,
    ),
  }
}
