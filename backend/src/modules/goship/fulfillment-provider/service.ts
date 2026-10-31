import {
  AbstractFulfillmentProviderService,
  MedusaError,
} from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CreateFulfillmentResult,
  CreateShippingOptionDTO,
  FulfillmentDTO,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types"
import { GoshipApiError, GoshipClient, type GoshipRate, type GoshipShipmentRequest } from "../client"
import {
  GOSHIP_GOODS_TYPE_MAX,
  GOSHIP_GOODS_TYPE_META_KEY,
  GOSHIP_TIERS,
  getGoshipTier,
  goshipDeliveryNoteLabel,
  goshipFallbackFee,
  goshipParcelBaseFromEnv,
  isKnownGoodsType,
  parseGoshipParcelSettings,
  resolveGoshipService,
  sanitizeGoodsTypes,
  type GoshipParcelSettings,
  type GoshipTierId,
} from "../config"
import { isGoshipEnabledEffective, readGoshipSettingValues } from "../settings"
import {
  buildParcel,
  buildRateRequest,
  DEFAULT_PARCEL,
  resolveOriginAddress,
  selectRateForService,
  toGoshipAddress,
  toRateSummary,
  type ParcelDefaults,
  type RateItem,
  type RateSummary,
} from "../rates"
import {
  buildShipmentContact,
  buildShipmentParcel,
  collectGoodsTypes,
  composeParcelMetadata,
  fullName,
  normalizeTrackingNumber,
  resolveOriginContact,
  streetLine,
  type OriginDefaults,
} from "../shipments"

/** knex `raw` — dependency dùng chung mà fulfillment provider được inject. */
type KnexLike = {
  raw(sql: string, bindings?: unknown[]): Promise<unknown>
}

type InjectedDependencies = {
  logger: Logger
  __pg_connection__?: KnexLike
}

export type GoshipProviderOptions = {
  token?: string
  base_url?: string
  /** Mức phí mặc định (VND) khi không gọi được `/rates`. */
  fallback_fee?: number | string
  /** Tier mặc định khi option không chỉ định service. */
  default_service?: string
}

/** Số dương từ env, nếu không hợp lệ thì lấy mặc định. */
const positiveEnv = (value: unknown, fallback: number): number => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

/** Đọc liên hệ điểm gửi mặc định từ ENV (script đồng bộ có thể ghi đè theo kho). */
const originDefaultsFromEnv = (): OriginDefaults => ({
  name: process.env.GOSHIP_ORIGIN_NAME ?? "Kho HCM",
  phone: process.env.GOSHIP_ORIGIN_PHONE ?? "",
  street: process.env.GOSHIP_ORIGIN_ADDRESS ?? "",
})

/** Một dòng `product_variant` cần cho việc dựng kiện hàng. */
type VariantRow = {
  id: string
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  metadata: Record<string, unknown> | null
  product_id: string | null
}

/**
 * Đọc "loại hàng" từ metadata JSON. Nhận chuỗi hoặc mảng (giữ nhiều giá trị,
 * khử trùng). GoShip cho tối đa 2 loại — việc cắt bớt do `collectGoodsTypes`
 * lo. Trả `[]` khi không khai.
 */
const readGoodsTypesMeta = (metadata: unknown): string[] => {
  if (!metadata || typeof metadata !== "object") return []
  const value = (metadata as Record<string, unknown>)[GOSHIP_GOODS_TYPE_META_KEY]
  const raw = typeof value === "string" ? [value] : Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const name = typeof item === "string" ? item.trim() : ""
    if (name && !seen.has(name)) {
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

/**
 * Fulfillment provider GoShip (`fp_goship_goship`).
 *
 * Vai trò: **chỉ tính cước + tạo/hủy vận đơn**. Giá ship cố định là 2 shipping
 * option `flat` native; GoShip là lớp tùy chọn bật/tắt từ **Admin UI** (bảng
 * `goship_setting`, dự phòng `GOSHIP_ENABLED`) — xem `settings.ts`.
 *
 *  - BẬT  → option GoShip hiện ở checkout, `calculatePrice` gọi `POST /rates`,
 *           admin "Tạo fulfillment" gọi `POST /shipments`.
 *  - TẮT  → option GoShip bị ẩn (rule `goship_enabled`) và provider chặn tạo
 *           option/tính giá/vận đơn mới.
 */
class GoshipFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "goship"

  protected readonly logger_: Logger
  protected readonly options_: GoshipProviderOptions
  protected readonly client_: GoshipClient
  protected readonly parcelDefaults_: ParcelDefaults
  protected readonly knex_?: KnexLike

  constructor(container: InjectedDependencies, options: GoshipProviderOptions = {}) {
    super()
    this.logger_ = container.logger
    this.options_ = options
    this.knex_ = container.__pg_connection__
    this.client_ = new GoshipClient({
      token: options.token ?? process.env.GOSHIP_TOKEN,
      baseUrl: options.base_url ?? process.env.GOSHIP_BASE_URL,
      logger: container.logger,
    })
    this.parcelDefaults_ = {
      weightGrams: positiveEnv(process.env.GOSHIP_DEFAULT_WEIGHT_GRAMS, DEFAULT_PARCEL.weightGrams),
      length: positiveEnv(process.env.GOSHIP_DEFAULT_LENGTH_CM, DEFAULT_PARCEL.length),
      width: positiveEnv(process.env.GOSHIP_DEFAULT_WIDTH_CM, DEFAULT_PARCEL.width),
      height: positiveEnv(process.env.GOSHIP_DEFAULT_HEIGHT_CM, DEFAULT_PARCEL.height),
    }
  }

  /** Cờ hiệu lực (DB trước, ENV dự phòng) — đọc lúc gọi, không cache. */
  private async enabled_(): Promise<boolean> {
    return isGoshipEnabledEffective(this.knex_)
  }

  /** Số phí GoShip thu của shop (0 = khách trả, 1 = shop trả). Mặc định 1. */
  private payer_(): 0 | 1 {
    return Number(process.env.GOSHIP_PAYER ?? 1) === 0 ? 0 : 1
  }

  /**
   * Cấu hình "Thông tin hàng gửi" hiệu lực: nền ENV → từng khoá trong
   * `goship_setting` ghi đè (Admin UI). Provider không resolve được service của
   * module nên đọc thẳng DB qua knex (xem `readGoshipSettingValues`).
   */
  private async parcelSettings_(): Promise<GoshipParcelSettings> {
    // Nền: ENV + mặc định của provider (dims/payer đọc một lần ở constructor).
    const base: GoshipParcelSettings = {
      ...goshipParcelBaseFromEnv(),
      payer: this.payer_(),
      weightGrams: this.parcelDefaults_.weightGrams,
      length: this.parcelDefaults_.length,
      width: this.parcelDefaults_.width,
      height: this.parcelDefaults_.height,
    }
    const values = await readGoshipSettingValues(this.knex_)
    return parseGoshipParcelSettings(values, base)
  }

  /** Đọc `product_variant` (cân nặng/kích thước/metadata) theo danh sách id. */
  private async fetchVariants_(ids: string[]): Promise<Map<string, VariantRow>> {
    const map = new Map<string, VariantRow>()
    if (!ids.length || !this.knex_) return map
    try {
      const result = await this.knex_.raw(
        `SELECT "id", "weight", "length", "width", "height", "metadata", "product_id"
           FROM "product_variant"
          WHERE "id" = ANY(?) AND "deleted_at" IS NULL`,
        [ids],
      )
      const rows =
        (result as { rows?: VariantRow[] })?.rows ?? (result as VariantRow[]) ?? []
      for (const row of rows) map.set(String(row.id), row)
    } catch (err) {
      this.logger_.warn(
        `[goship] không đọc được product_variant: ${(err as Error)?.message}`,
      )
    }
    return map
  }

  /** Đọc metadata `product` (để fallback "loại hàng") theo danh sách id. */
  private async fetchProductMeta_(
    ids: string[],
  ): Promise<Map<string, Record<string, unknown> | null>> {
    const map = new Map<string, Record<string, unknown> | null>()
    if (!ids.length || !this.knex_) return map
    try {
      const result = await this.knex_.raw(
        `SELECT "id", "metadata" FROM "product"
          WHERE "id" = ANY(?) AND "deleted_at" IS NULL`,
        [ids],
      )
      const rows =
        (result as { rows?: Array<{ id: string; metadata: unknown }> })?.rows ??
        (result as Array<{ id: string; metadata: unknown }>) ??
        []
      for (const row of rows) {
        map.set(
          String(row.id),
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : null,
        )
      }
    } catch (err) {
      this.logger_.warn(`[goship] không đọc được product: ${(err as Error)?.message}`)
    }
    return map
  }

  /**
   * Làm giàu item order-line thành `RateItem`: lấy cân nặng/kích thước từ
   * variant trong DB (DTO không có) và giải mã "loại hàng" theo thứ tự
   * variant.metadata → product.metadata. Thiếu dữ liệu → `buildParcel` dùng mặc định.
   */
  private async enrichItems_(
    items: Array<Record<string, unknown>> | undefined,
  ): Promise<RateItem[]> {
    const list = Array.isArray(items) ? items : []
    if (!list.length) return []

    const variantIds = [
      ...new Set(list.map((i) => String(i.variant_id ?? "")).filter(Boolean)),
    ]
    const variants = await this.fetchVariants_(variantIds)
    const productIds = [
      ...new Set(
        [
          ...list.map((i) => String(i.product_id ?? "")),
          ...variantIds.map((id) => String(variants.get(id)?.product_id ?? "")),
        ].filter(Boolean),
      ),
    ]
    const products = await this.fetchProductMeta_(productIds)

    return list.map((item) => {
      const variant = variants.get(String(item.variant_id ?? ""))
      const productMeta =
        products.get(String(item.product_id ?? "")) ??
        (variant?.product_id ? products.get(String(variant.product_id)) : undefined) ??
        null
      const rawVariant = readGoodsTypesMeta(variant?.metadata)
      const rawProduct = readGoodsTypesMeta(productMeta)
      // Chỉ nhận giá trị có trong danh mục GoShip (lọc sai chính tả).
      const variantTypes = sanitizeGoodsTypes(rawVariant)
      const productTypes = sanitizeGoodsTypes(rawProduct)
      const goodsTypes = variantTypes.length ? variantTypes : productTypes
      const unknown = [...rawVariant, ...rawProduct].filter(
        (name) => !isKnownGoodsType(name),
      )
      if (unknown.length) {
        this.logger_.warn(
          `[goship] bỏ "loại hàng" không có trong danh mục (variant=${String(
            item.variant_id ?? "?",
          )}): ${[...new Set(unknown)].join(", ")}`,
        )
      }
      const quantity = Number(item.quantity ?? item.raw_quantity ?? 1)
      return {
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        variant: variant
          ? {
              weight: variant.weight,
              length: variant.length,
              width: variant.width,
              height: variant.height,
            }
          : null,
        goodsTypes,
      }
    })
  }

  /**
   * Các tier admin thấy khi tạo option. Khi provider bị TẮT, trả rỗng để admin
   * không tạo thêm option GoShip.
   */
  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    if (!(await this.enabled_())) return []
    return GOSHIP_TIERS.map((tier) => ({ id: tier.id, name: tier.name }))
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return Boolean(getGoshipTier(data?.service ?? data?.id))
  }

  async canCalculate(data: CreateShippingOptionDTO): Promise<boolean> {
    if (!(await this.enabled_())) return false
    return this.validateOption((data?.data ?? {}) as Record<string, unknown>)
  }

  /**
   * Gọi `/rates` và trả cước của tier. Không bao giờ ném lỗi vì cước — rơi về
   * `fallback_fee` để checkout vẫn dùng được khi GoShip trục trặc. Lỗi cấu
   * hình (thiếu mã địa giới) cũng chỉ là cảnh báo.
   */
  async calculatePrice(
    optionData: Record<string, unknown>,
    _data: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    if (!(await this.enabled_())) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "GoShip đang tắt — không tính cước.",
      )
    }

    const service = resolveGoshipService(optionData)
    const rate = await this.quote(service, optionData, context)
    const total = Number(rate?.total_fee)

    if (!Number.isFinite(total) || total <= 0) {
      const fallback = goshipFallbackFee()
      this.logger_.warn(
        `[goship] không lấy được cước thật (service=${service}) — dùng phí dự phòng ${fallback}₫.`,
      )
      return { calculated_amount: fallback, is_calculated_price_tax_inclusive: true }
    }

    this.logger_.info(
      `[goship] cước ${service}: ${total}₫ (${rate?.carrier_name} — ${rate?.service}).`,
    )
    return { calculated_amount: total, is_calculated_price_tax_inclusive: true }
  }

  /**
   * Khi thêm shipping method: tính lại rate để LƯU hãng/dịch vụ dự kiến vào
   * `data` (createFulfillment cần để tạo vận đơn). Best-effort — lỗi GoShip
   * không chặn chọn phương thức (giá đã tính ở `calculatePrice`).
   */
  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext,
  ): Promise<Record<string, unknown>> {
    const service = resolveGoshipService(optionData)
    const base = { ...optionData, ...data, service }
    if (!(await this.enabled_())) return base

    try {
      const rate = await this.quote(service, optionData, context)
      if (!rate) return base
      const summary: RateSummary = toRateSummary(rate)
      return { ...base, rate: summary }
    } catch (err) {
      this.logger_.warn(`[goship] không lưu được rate vào shipping method: ${(err as Error)?.message}`)
      return base
    }
  }

  /**
   * Admin "Tạo fulfillment" → tạo vận đơn GoShip (`POST /shipments`).
   *
   * Dữ liệu đầu vào:
   *  - `data` = `data` của shipping method (`{service, address_from, rate}`),
   *  - `order` = order đầy đủ (địa chỉ giao, items, tổng tiền),
   *  - `items` = các item được giao (số lượng, sku...).
   *
   * GoShip tạo đơn **bất đồng bộ**: response chỉ là trạng thái ban đầu; kết quả
   * thật (mã vận đơn, lỗi hãng) đến qua webhook. Ta lưu `goship_id` + tracking
   * vào `data`/`labels` để admin thấy ngay, webhook cập nhật tiếp.
   */
  async createFulfillment(
    data: Record<string, unknown>,
    _items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
    additionalData?: Record<string, unknown>,
  ): Promise<CreateFulfillmentResult> {
    if (!(await this.enabled_())) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "GoShip đang tắt — không tạo vận đơn. Bật lại trong Admin → GoShip.",
      )
    }

    const rate = (data?.rate ?? {}) as RateSummary & { rate_id?: string }
    const rateId = rate?.rate_id ?? (data?.rate_id as string | undefined)
    if (!rateId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Thiếu `rate` GoShip trên shipping method — hãy chọn lại phương thức giao hàng.",
      )
    }

    const orderRecord = (order ?? {}) as Record<string, unknown>
    const shippingAddress = (orderRecord.shipping_address ?? {}) as Record<string, unknown>

    const originGeo = resolveOriginAddress(data, undefined)
    if (!originGeo) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Thiếu mã điểm gửi GoShip (`address_from`) trên shipping option.",
      )
    }
    const destGeo = toGoshipAddress(shippingAddress.metadata)
    if (!destGeo) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Địa chỉ giao thiếu mã GoShip (tỉnh/quận/phường) — không tạo được vận đơn.",
      )
    }

    const originContact = resolveOriginContact(data, originDefaultsFromEnv())

    // "Thông tin hàng gửi": chính sách chung (DB → ENV) + thuộc tính sản phẩm.
    const settings = await this.parcelSettings_()
    const enrichedItems = await this.enrichItems_(
      orderRecord.items as Array<Record<string, unknown>> | undefined,
    )
    const parcelDefaults: ParcelDefaults = {
      weightGrams: settings.weightGrams,
      length: settings.length,
      width: settings.width,
      height: settings.height,
      weightUnit: settings.weightUnit,
      dimensionUnit: settings.dimensionUnit,
    }
    const goodsTypes = collectGoodsTypes(
      enrichedItems,
      settings.goodsTypes,
      GOSHIP_GOODS_TYPE_MAX,
    )
    const parcelMetadata = composeParcelMetadata({
      goodsTypes,
      deliveryNote: goshipDeliveryNoteLabel(settings.deliveryNote),
      note: typeof additionalData?.note === "string" ? additionalData.note : undefined,
      partDelivery: settings.partDelivery,
    })
    const cod = Number(additionalData?.cod ?? settings.cod ?? 0)
    const orderTotal = Number(orderRecord.total ?? 0)
    const declaredAmount =
      settings.declareValue === "order_total" &&
      Number.isFinite(orderTotal) &&
      orderTotal > 0
        ? Math.round(orderTotal)
        : 0

    const orderId = String(orderRecord.id ?? fulfillment.id ?? "")
    const toContact = buildShipmentContact(
      {
        name: fullName(shippingAddress.first_name, shippingAddress.last_name),
        phone: shippingAddress.phone as string | undefined,
        street: streetLine(shippingAddress),
        email: orderRecord.email as string | undefined,
      },
      destGeo,
    )
    // GoShip bắt buộc có số điện thoại người nhận (thiếu → HTTP 422 khó hiểu).
    if (!toContact.phone) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Địa chỉ giao thiếu số điện thoại — GoShip yêu cầu số điện thoại người nhận.",
      )
    }

    const payload: GoshipShipmentRequest = {
      shipment: {
        rate: String(rateId),
        payer: settings.payer,
        order_id: orderId,
        is_recall: 0,
        address_from: buildShipmentContact(
          {
            name: originContact.name,
            phone: originContact.phone,
            street: originContact.street,
          },
          originGeo,
          "Kho gửi",
        ),
        address_to: toContact,
        parcel: buildShipmentParcel(enrichedItems, parcelDefaults, {
          cod,
          amount: declaredAmount,
          metadata: parcelMetadata,
        }),
      },
    }

    let shipment
    try {
      shipment = await this.client_.createShipment(payload)
    } catch (err) {
      if (err instanceof GoshipApiError) {
        const detail =
          typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? {})
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `GoShip không tạo được vận đơn (HTTP ${err.status}): ${err.message} ${String(
            detail,
          ).slice(0, 400)}`,
        )
      }
      throw err
    }

    if (shipment.carrier_error) {
      const message =
        typeof shipment.carrier_error === "string"
          ? shipment.carrier_error
          : JSON.stringify(shipment.carrier_error)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `GoShip báo lỗi tạo vận đơn: ${message}`,
      )
    }

    const trackingNumber = normalizeTrackingNumber(shipment.tracking_number)
    const reference = trackingNumber ?? shipment.id

    this.logger_.info(
      `[goship] đã tạo vận đơn ${shipment.id} (${shipment.shipment_status_txt}) cho order ${orderId}.`,
    )

    return {
      data: {
        ...data,
        goship_id: shipment.id,
        goship_status: shipment.shipment_status,
        goship_status_text: shipment.shipment_status_txt,
        goship_carrier: shipment.carrier ?? rate?.carrier ?? null,
        goship_carrier_short_name: shipment.carrier_short_name ?? null,
        goship_fee: shipment.fee ?? null,
        goship_cod: shipment.cod ?? null,
        goship_amount: declaredAmount,
        goship_goods_types: goodsTypes,
        goship_parcel_metadata: parcelMetadata ?? null,
        goship_created_at: shipment.created_at ?? null,
        tracking_number: reference,
      },
      labels: [
        {
          tracking_number: reference,
          tracking_url: "",
          label_url: "",
        },
      ],
    }
  }

  /** Hủy vận đơn GoShip (`DELETE /shipments/{gcode}`); 404 = đã hủy, bỏ qua. */
  async cancelFulfillment(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const gcode = data?.goship_id as string | undefined
    if (!gcode) {
      this.logger_.warn("[goship] cancelFulfillment: fulfillment không có `goship_id` — bỏ qua.")
      return {}
    }
    try {
      await this.client_.cancelShipment(gcode)
      this.logger_.info(`[goship] đã hủy vận đơn ${gcode}.`)
      return {}
    } catch (err) {
      if (err instanceof GoshipApiError && err.status === 404) {
        this.logger_.warn(`[goship] vận đơn ${gcode} không còn trên GoShip — coi như đã hủy.`)
        return {}
      }
      throw err
    }
  }

  async createReturnFulfillment(): Promise<CreateFulfillmentResult> {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "GoShip createReturnFulfillment chưa được hỗ trợ.",
    )
  }

  async retrieveDocuments(): Promise<void> {
    // Chưa dùng tài liệu của GoShip.
    return
  }

  /**
   * Gọi GoShip lấy rate cho tier. Trả `null` (kèm cảnh báo) khi thiếu mã địa
   * giới hoặc GoShip không trả rate; ném `GoshipApiError` khi HTTP lỗi.
   */
  private async quote(
    service: GoshipTierId,
    optionData: Record<string, unknown>,
    context: CalculateShippingOptionPriceContext | ValidateFulfillmentDataContext,
  ): Promise<GoshipRate | null> {
    const from = resolveOriginAddress(
      optionData,
      (context as { from_location?: { metadata?: unknown } }).from_location?.metadata,
    )
    const to = toGoshipAddress(
      (context as { shipping_address?: { metadata?: unknown } }).shipping_address?.metadata,
    )

    if (!from || !to) {
      this.logger_.warn(
        `[goship] thiếu mã địa giới GoShip (from=${from ? "ok" : "-"}, to=${to ? "ok" : "-"}) — bỏ qua tính cước.`,
      )
      return null
    }

    const items = (context as { items?: RateItem[] }).items
    // Dùng cấu hình hiệu lực (Admin → GoShip → ENV) để lấy giá trị mặc định VÀ
    // đơn vị shop khai, rồi quy đổi sang g/cm cho GoShip.
    const settings = await this.parcelSettings_()
    const parcelDefaults: ParcelDefaults = {
      weightGrams: settings.weightGrams,
      length: settings.length,
      width: settings.width,
      height: settings.height,
      weightUnit: settings.weightUnit,
      dimensionUnit: settings.dimensionUnit,
    }
    const parcel = buildParcel(items, parcelDefaults)

    try {
      const rates = await this.client_.getRates(buildRateRequest(from, to, parcel))
      const rate = selectRateForService(rates, service)
      if (!rate) {
        this.logger_.warn(`[goship] GoShip không trả rate nào cho service=${service}.`)
        return null
      }
      return rate
    } catch (err) {
      if (err instanceof GoshipApiError) {
        this.logger_.warn(`[goship] /rates lỗi (service=${service}): ${err.message}`)
        return null
      }
      throw err
    }
  }
}

export default GoshipFulfillmentService
