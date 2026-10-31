import { MedusaService } from "@medusajs/framework/utils"
import type { Logger } from "@medusajs/framework/types"
import GoshipLocation from "./models/location"
import GoshipSetting from "./models/setting"
import GoshipShipmentEvent from "./models/shipment-event"
import { GoshipApiError, GoshipClient } from "./client"
import {
  GOSHIP_PARCEL_KEYS,
  GOSHIP_SETTING_KEY,
  goshipFlagValue,
  goshipParcelBaseFromEnv,
  isGoshipEnabled,
  parseGoshipEnabled,
  parseGoshipParcelSettings,
  parseDimensionUnit,
  parsePayer,
  parseWeightUnit,
  sanitizeGoodsTypes,
  type GoshipParcelSettings,
} from "./config"
import { toFlag, type GoshipWebhookPayload } from "./webhook"

type InjectedDependencies = {
  logger: Logger
}

export type GoshipModuleOptions = {
  token?: string
  base_url?: string
}

export type GoshipLocationLevel = "province" | "district" | "ward"

/** Một đơn vị hành chính đã chuẩn hoá để trả cho storefront. */
export type GoshipLocationDTO = {
  code: string
  name: string
  parent_code: string | null
  support_carriers: string[] | null
}

const LEVEL_PROVINCE: GoshipLocationLevel = "province"
const LEVEL_DISTRICT: GoshipLocationLevel = "district"
const LEVEL_WARD: GoshipLocationLevel = "ward"

const toCode = (value: string | number): string => String(value)

/** Lỗi cấu hình/ngoại lệ của GoShip khi chưa có cache để phục vụ. */
export class GoshipLocationUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "GoshipLocationUnavailableError"
  }
}

/**
 * Service của custom module GoShip.
 *
 * Nhiệm vụ:
 *  - Bọc `GoshipClient` (REST).
 *  - Cache danh mục địa giới (tỉnh/quận/phường) vào bảng
 *    `goship_location` theo kiểu **lazy fill**: lần đầu một cấp được hỏi thì
 *    gọi GoShip rồi ghi DB; các lần sau đọc DB.
 *
 * GoShip bắt buộc mã số địa giới khi tính phí / tạo vận đơn, nên tầng
 * storefront luôn lấy danh mục qua service này để giữ code + name.
 */
class GoshipModuleService extends MedusaService({
  GoshipLocation,
  GoshipSetting,
  GoshipShipmentEvent,
}) {
  protected readonly client_: GoshipClient
  protected readonly logger_: Logger

  /** Chốt dedup trong process: nhiều request cùng nạp 1 cấp → chờ chung 1 Promise. */
  private readonly inflight_ = new Map<string, Promise<void>>()
  /** Các cặp (level, parent) đã chắc chắn có dữ liệu trong DB. */
  private readonly loaded_ = new Set<string>()

  constructor(container: InjectedDependencies, options: GoshipModuleOptions = {}) {
    // MedusaService yêu cầu super(...arguments) khi tự định nghĩa constructor.
    super(...arguments)
    this.logger_ = container.logger
    this.client_ = new GoshipClient({
      token: options.token ?? process.env.GOSHIP_TOKEN,
      baseUrl: options.base_url ?? process.env.GOSHIP_BASE_URL,
      logger: container.logger,
    })
  }

  /** Đã cấu hình `GOSHIP_TOKEN` chưa (dùng cho healthcheck/admin). */
  async hasCredentials(): Promise<boolean> {
    return this.client_.hasToken()
  }

  // ── Quản lý webhook (Admin UI) ──────────────────────────────────────

  /** Danh sách webhook đã đăng ký trên GoShip. */
  async listWebhooks() {
    return this.client_.listWebhooks()
  }

  /** Đăng ký endpoint nhận webhook (bỏ qua nếu đã tồn tại). */
  async registerWebhook(endpoint: string): Promise<{ endpoint: string; already: boolean }> {
    const existing = await this.client_.listWebhooks()
    if (existing.some((w) => (w.endpoint ?? "").replace(/\/+$/, "") === endpoint.replace(/\/+$/, ""))) {
      return { endpoint, already: true }
    }
    await this.client_.registerWebhook(endpoint)
    return { endpoint, already: false }
  }

  /** Hủy mọi webhook trỏ tới `endpoint`. Trả số đã xoá. */
  async unregisterWebhook(endpoint: string): Promise<number> {
    const existing = await this.client_.listWebhooks()
    const matches = existing.filter(
      (w) => (w.endpoint ?? "").replace(/\/+$/, "") === endpoint.replace(/\/+$/, ""),
    )
    for (const sub of matches) await this.client_.deleteWebhook(sub.id)
    return matches.length
  }

  /** Tra vận đơn trên GoShip theo gcode / order_id / mã hãng (đối soát). */
  async findShipment(code: string) {
    return this.client_.searchShipment(code)
  }

  // ── Cờ bật/tắt (Admin UI điều khiển) ────────────────────────────────

  /**
   * Trạng thái cờ hiện tại + nguồn giá trị. `db` = cấu hình trong Admin UI,
   * `env` = dự phòng `GOSHIP_ENABLED`, `default` = chưa cấu hình (TẮT).
   */
  async getToggle(): Promise<{ enabled: boolean; source: "db" | "env" | "default" }> {
    const rows = (await this.listGoshipSettings({ key: GOSHIP_SETTING_KEY }, {
      take: 1,
    })) as Array<{ value?: string | null }>
    const row = rows[0]
    if (row) return { enabled: parseGoshipEnabled(row.value, false), source: "db" }

    const envRaw = (process.env.GOSHIP_ENABLED ?? "").trim()
    if (envRaw) return { enabled: isGoshipEnabled(), source: "env" }
    return { enabled: false, source: "default" }
  }

  /** Cờ hiệu lực (đọc lúc gọi, không cache) — dùng cho hook/route. */
  async isEnabled(): Promise<boolean> {
    try {
      return (await this.getToggle()).enabled
    } catch (err) {
      this.logger_.warn(`[goship] không đọc được cờ bật/tắt: ${(err as Error)?.message}`)
      return isGoshipEnabled()
    }
  }

  /** Ghi cờ bật/tắt vào DB (upsert theo khoá `enabled`). */
  async setEnabled(enabled: boolean): Promise<boolean> {
    const value = goshipFlagValue(enabled)
    const rows = (await this.listGoshipSettings({ key: GOSHIP_SETTING_KEY }, {
      take: 1,
    })) as Array<{ id: string }>
    if (rows[0]?.id) {
      await this.updateGoshipSettings({ id: rows[0].id, value })
    } else {
      await this.createGoshipSettings({ key: GOSHIP_SETTING_KEY, value })
    }
    this.logger_.info(`[goship] đã ${enabled ? "BẬT" : "TẮT"} GoShip (từ Admin UI).`)
    return enabled
  }

  /**
   * Xoá dòng cấu hình `enabled` khỏi DB → cờ quay về dự phòng `GOSHIP_ENABLED`
   * (hoặc mặc định TẮT). Dùng khi script đồng bộ cần khôi phục trạng thái trước
   * đó mà trước đó vốn không do DB điều khiển.
   */
  async clearEnabled(): Promise<void> {
    const rows = (await this.listGoshipSettings({ key: GOSHIP_SETTING_KEY }, {
      take: 1,
    })) as Array<{ id: string }>
    if (rows[0]?.id) await this.deleteGoshipSettings(rows[0].id)
  }

  // ── Cấu hình "Thông tin hàng gửi" (parcel) ──────────────────────────

  /**
   * Cấu hình kiện hàng hiệu lực: nền ENV → từng khoá trong DB ghi đè.
   * Đọc lúc gọi nên Admin sửa là áp dụng ngay cho vận đơn kế tiếp.
   */
  async getParcelSettings(): Promise<GoshipParcelSettings> {
    const rows = (await this.listGoshipSettings({}, { take: 200 })) as Array<{
      key: string
      value: string | null
    }>
    const values: Record<string, string | null> = {}
    for (const row of rows) values[row.key] = row.value
    return parseGoshipParcelSettings(values, goshipParcelBaseFromEnv())
  }

  /** Upsert một dòng `goship_setting` theo khoá. */
  private async upsertSetting_(key: string, value: string): Promise<void> {
    const rows = (await this.listGoshipSettings({ key }, { take: 1 })) as Array<{
      id: string
    }>
    if (rows[0]?.id) await this.updateGoshipSettings({ id: rows[0].id, value })
    else await this.createGoshipSettings({ key, value })
  }

  /**
   * Lưu cấu hình kiện hàng vào DB (chỉ ghi khoá có trong `input`).
   * Trả cấu hình hiệu lực sau khi lưu.
   */
  async setParcelSettings(
    input: Partial<GoshipParcelSettings>,
  ): Promise<GoshipParcelSettings> {
    const writes: Array<[string, string]> = []
    if (input.payer !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.payer, String(parsePayer(input.payer, 1))])
    }
    if (input.deliveryNote !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.deliveryNote, String(input.deliveryNote ?? "")])
    }
    if (input.goodsTypes !== undefined) {
      writes.push([
        GOSHIP_PARCEL_KEYS.goodsTypes,
        sanitizeGoodsTypes(input.goodsTypes).join(","),
      ])
    }
    if (input.declareValue !== undefined) {
      writes.push([
        GOSHIP_PARCEL_KEYS.declareValue,
        input.declareValue === "order_total" ? "order_total" : "off",
      ])
    }
    if (input.weightGrams !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.weight, String(input.weightGrams)])
    }
    if (input.length !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.length, String(input.length)])
    }
    if (input.width !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.width, String(input.width)])
    }
    if (input.height !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.height, String(input.height)])
    }
    if (input.cod !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.cod, String(input.cod)])
    }
    if (input.partDelivery !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.partDelivery, input.partDelivery ? "true" : "false"])
    }
    if (input.weightUnit !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.weightUnit, parseWeightUnit(input.weightUnit)])
    }
    if (input.dimensionUnit !== undefined) {
      writes.push([GOSHIP_PARCEL_KEYS.dimensionUnit, parseDimensionUnit(input.dimensionUnit)])
    }

    for (const [key, value] of writes) await this.upsertSetting_(key, value)
    this.logger_.info(`[goship] đã lưu cấu hình kiện hàng (${writes.length} khoá).`)
    return this.getParcelSettings()
  }

  // ── Nhật ký webhook (dedup + timeline) ──────────────────────────────
  /**
   * Ghi một sự kiện webhook, dedup theo UNIQUE `(gcode, status, update_time)`.
   * Trả `duplicate: true` nếu đã có — route vẫn trả 200 để GoShip ngừng retry.
   */
  async recordShipmentEvent(
    payload: GoshipWebhookPayload,
    fulfillmentId?: string | null,
  ): Promise<{ duplicate: boolean; id?: string }> {
    const gcode = String(payload.gcode ?? "")
    const status = String(payload.status ?? "")
    const updateTime = payload.update_time ?? null

    const existing = (await this.listGoshipShipmentEvents(
      { gcode, status, update_time: updateTime } as never,
      { take: 1 },
    )) as Array<{ id: string }>
    if (existing.length) return { duplicate: true, id: existing[0].id }

    try {
      const created = (await this.createGoshipShipmentEvents({
        gcode,
        carrier_code: payload.code ? String(payload.code) : null,
        order_id: payload.order_id ? String(payload.order_id) : null,
        fulfillment_id: fulfillmentId ?? null,
        status,
        status_text: payload.status_text ? String(payload.status_text) : null,
        description: payload.description ? String(payload.description) : null,
        tracking_url: payload.tracking_url ? String(payload.tracking_url) : null,
        carrier_short_name: payload.carrier_short_name
          ? String(payload.carrier_short_name)
          : null,
        is_return: toFlag(payload.is_return),
        is_lost: toFlag(payload.is_lost),
        cod: payload.cod != null && payload.cod !== "" ? Number(payload.cod) : null,
        fee: payload.fee != null && payload.fee !== "" ? Number(payload.fee) : null,
        update_time: updateTime,
        payload: payload as unknown as Record<string, unknown>,
      } as never)) as { id: string }
      return { duplicate: false, id: created.id }
    } catch {
      // Unique race với request khác → coi như đã xử lý.
      return { duplicate: true }
    }
  }

  /** Hành trình vận đơn (cũ → mới) để hiển thị ở trang tài khoản. */
  async listShipmentTimeline(
    gcode: string,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = (await this.listGoshipShipmentEvents(
      { gcode } as never,
      { order: { update_time: "ASC" }, take: 200 },
    )) as Array<Record<string, unknown>>
    return rows.map((row) => ({
      status: String(row.status),
      status_text: row.status_text ?? null,
      description: row.description ?? null,
      tracking_url: row.tracking_url ?? null,
      carrier_short_name: row.carrier_short_name ?? null,
      is_return: row.is_return === true,
      is_lost: row.is_lost === true,
      update_time: row.update_time ?? null,
    }))
  }

  async getProvinces(): Promise<GoshipLocationDTO[]> {
    return this.readLevel(LEVEL_PROVINCE, null)
  }

  async getDistricts(cityCode: string | number): Promise<GoshipLocationDTO[]> {
    return this.readLevel(LEVEL_DISTRICT, toCode(cityCode))
  }

  async getWards(districtCode: string | number): Promise<GoshipLocationDTO[]> {
    return this.readLevel(LEVEL_WARD, toCode(districtCode))
  }

  /**
   * Nạp lại một cấp danh mục (xoá cache cũ). Dùng cho job đồng bộ định kỳ
   * hoặc khi GoShip cập nhật địa giới. `parentCode` bỏ trống = cả cấp.
   */
  async refreshLevel(level: GoshipLocationLevel, parentCode?: string | null) {
    const where: Record<string, unknown> = { level }
    if (parentCode !== undefined && level !== LEVEL_PROVINCE) {
      where.parent_code = parentCode === null ? null : toCode(parentCode)
    }
    await this.deleteGoshipLocations(where as never)
    const key = this.cacheKey(level, parentCode === undefined ? null : parentCode)
    this.loaded_.delete(key)
  }

  private cacheKey(level: GoshipLocationLevel, parentCode: string | null): string {
    return `${level}:${parentCode ?? ""}`
  }

  private async readLevel(
    level: GoshipLocationLevel,
    parentCode: string | null,
  ): Promise<GoshipLocationDTO[]> {
    await this.ensureLoaded(level, parentCode)

    const filters: Record<string, unknown> = { level }
    if (level !== LEVEL_PROVINCE) {
      filters.parent_code = parentCode
    }
    const rows = (await this.listGoshipLocations(filters as never, {
      take: 2000,
      order: { sort_order: "ASC" },
    } as never)) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      code: String(row.code),
      name: String(row.name),
      parent_code: (row.parent_code as string | null) ?? null,
      support_carriers: (row.support_carriers as string[] | null) ?? null,
    }))
  }

  private async ensureLoaded(level: GoshipLocationLevel, parentCode: string | null) {
    const key = this.cacheKey(level, parentCode)
    if (this.loaded_.has(key)) return

    const existing = this.inflight_.get(key)
    if (existing) return existing

    const task = this.loadLevel(level, parentCode)
      .then(() => {
        this.loaded_.add(key)
      })
      .finally(() => {
        this.inflight_.delete(key)
      })

    this.inflight_.set(key, task)
    return task
  }

  private async loadLevel(level: GoshipLocationLevel, parentCode: string | null): Promise<void> {
    // Đã có dữ liệu trong DB (instance khác nạp, hoặc restart process) → khỏi gọi lại.
    const filters: Record<string, unknown> = { level }
    if (level !== LEVEL_PROVINCE) {
      filters.parent_code = parentCode
    }
    const existing = await this.listGoshipLocations(filters as never, { take: 1 } as never)
    if (existing.length) return

    if (!this.client_.hasToken()) {
      throw new GoshipLocationUnavailableError(
        "GoShip chưa được cấu hình (thiếu GOSHIP_TOKEN) và cache địa giới đang trống.",
      )
    }

    const rows = await this.fetchFromGoship(level, parentCode)
    if (!rows.length) {
      throw new GoshipLocationUnavailableError(
        `GoShip không trả về địa giới cho ${level}${parentCode ? ` (parent ${parentCode})` : ""}.`,
      )
    }

    try {
      await this.createGoshipLocations(rows as never)
    } catch (err) {
      // Unique (level, code) — instance khác đã nạp xong trước. Không phải lỗi.
      const stillEmpty = await this.listGoshipLocations(filters as never, { take: 1 } as never)
      if (!stillEmpty.length) throw err
    }
  }

  private async fetchFromGoship(
    level: GoshipLocationLevel,
    parentCode: string | null,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      if (level === LEVEL_PROVINCE) {
        const cities = await this.client_.getCities()
        return cities.map((c, index) => ({
          level: LEVEL_PROVINCE,
          code: toCode(c.id),
          name: c.name,
          parent_code: null,
          support_carriers: c.support_carriers ?? null,
          sort_order: index,
        }))
      }
      if (level === LEVEL_DISTRICT) {
        const districts = await this.client_.getDistricts(parentCode as string)
        return districts.map((d, index) => ({
          level: LEVEL_DISTRICT,
          code: toCode(d.id),
          name: d.name,
          parent_code: toCode(d.city_id ?? (parentCode as string)),
          support_carriers: d.support_carriers ?? null,
          sort_order: index,
        }))
      }
      const wards = await this.client_.getWards(parentCode as string)
      return wards.map((w, index) => ({
        level: LEVEL_WARD,
        code: toCode(w.id),
        name: w.name,
        parent_code: toCode(w.district_id ?? (parentCode as string)),
        support_carriers: w.support_carriers ?? null,
        sort_order: index,
      }))
    } catch (err) {
      if (err instanceof GoshipApiError) {
        this.logger_.warn(
          `[goship] không lấy được địa giới ${level} (parent ${parentCode ?? "-"}): ${err.message}`,
        )
        throw new GoshipLocationUnavailableError(
          `Không lấy được danh mục địa giới GoShip: ${err.message}`,
          err,
        )
      }
      throw err
    }
  }
}

export default GoshipModuleService
