import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  GOSHIP_DELIVERY_NOTES,
  GOSHIP_DIMENSION_UNITS,
  GOSHIP_GOODS_TYPE_MAX,
  GOSHIP_GOODS_TYPE_META_KEY,
  GOSHIP_GOODS_TYPES,
  GOSHIP_TIERS,
  GOSHIP_WEIGHT_UNITS,
  type GoshipParcelSettings,
} from "../../../../modules/goship/config"

/**
 * GET  /admin/goship/config — trạng thái GoShip cho trang Admin.
 * POST /admin/goship/config — bật/tắt GoShip + đăng ký/hủy webhook.
 *
 * Đây là điểm điều khiển **sau khi deploy**: nguồn cờ là bảng `goship_setting`
 * trong DB (không phải biến môi trường), nên bật/tắt ở đây có hiệu lực ngay ở
 * request checkout kế tiếp mà không cần restart.
 *
 * Route nằm dưới `/admin/*` → yêu cầu đăng nhập admin (session cookie).
 * Webhook secret KHÔNG bao giờ trả về, chỉ trả cờ `has_secret`.
 */
const GOSHIP_PROVIDER_ID = "goship_goship"

const trimSlash = (url: string) => url.replace(/\/+$/, "")

type GoshipModule = {
  getToggle(): Promise<{ enabled: boolean; source: "db" | "env" | "default" }>
  setEnabled(enabled: boolean): Promise<boolean>
  hasCredentials(): Promise<boolean>
  registerWebhook(endpoint: string): Promise<{ endpoint: string; already: boolean }>
  unregisterWebhook(endpoint: string): Promise<number>
  listWebhooks(): Promise<Array<{ id: number | string; endpoint: string }>>
  getParcelSettings(): Promise<GoshipParcelSettings>
  setParcelSettings(input: Partial<GoshipParcelSettings>): Promise<GoshipParcelSettings>
}

const webhookUrl = (): string => {
  const backendUrl = trimSlash(process.env.MEDUSA_BACKEND_URL ?? "")
  return backendUrl ? `${backendUrl}/webhooks/goship` : "/webhooks/goship"
}

const environment = (baseUrl: string): "test" | "live" | null =>
  !baseUrl ? null : baseUrl.includes("sandbox") ? "test" : "live"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const goship = req.scope.resolve<GoshipModule>("goship")

  let toggle: { enabled: boolean; source: string } = {
    enabled: false,
    source: "default",
  }
  let hasCredentials = false
  let parcel: GoshipParcelSettings | null = null
  try {
    toggle = await goship.getToggle()
    hasCredentials = await goship.hasCredentials()
    parcel = await goship.getParcelSettings()
  } catch (err) {
    logger.warn(`[goship] GET /admin/goship/config: ${String(err)}`)
  }

  // Đếm số shipping option đang dùng provider GoShip (đã provision hay chưa).
  let optionsCount = 0
  try {
    const fulfillment = req.scope.resolve(Modules.FULFILLMENT)
    const options = await fulfillment.listShippingOptions(
      {},
      { select: ["id", "provider_id"] },
    )
    optionsCount = options.filter((o) => o.provider_id === GOSHIP_PROVIDER_ID).length
  } catch (err) {
    logger.warn(`[goship] không đọc được shipping option: ${String(err)}`)
  }

  const baseUrl = process.env.GOSHIP_BASE_URL ?? ""
  const secret = process.env.GOSHIP_CLIENT_SECRET

  // Trạng thái webhook thực tế TRÊN GoShip (khác với "URL của ta là gì").
  // Best-effort: lỗi token/mạng chỉ làm mất chỉ báo, không chặn trang.
  const url = webhookUrl()
  let webhookRegistered = false
  let webhookEndpoints: string[] = []
  try {
    const subs = await goship.listWebhooks()
    webhookEndpoints = subs.map((s) => trimSlash(String(s.endpoint)))
    webhookRegistered = webhookEndpoints.includes(trimSlash(url))
  } catch (err) {
    logger.warn(`[goship] GET /admin/goship/config: không đọc được webhook GoShip — ${String(err)}`)
  }

  res.json({
    toggle: {
      enabled: toggle.enabled,
      source: toggle.source,
      /** Nhãn tiếng Việt cho UI. */
      source_label:
        toggle.source === "db"
          ? "Cấu hình trong Admin"
          : toggle.source === "env"
            ? "Dự phòng từ GOSHIP_ENABLED"
            : "Mặc định (TẮT)",
    },
    provider: {
      id: GOSHIP_PROVIDER_ID,
      registered: true,
      configured: hasCredentials,
      base_url: baseUrl || null,
      environment: environment(baseUrl),
      options_count: optionsCount,
    },
    webhook: {
      url: webhookUrl(),
      auth_method: secret ? "HMAC_SHA256" : "NONE",
      has_secret: Boolean(secret),
      header: "x-goship-hmac-sha256",
      /** URL của ta đã tồn tại trên GoShip chưa (đọc trực tiếp từ GoShip). */
      registered: webhookRegistered,
      /** Mọi endpoint đang đăng ký trên GoShip (để chẩn đoán). */
      endpoints: webhookEndpoints,
    },
    tiers: GOSHIP_TIERS.map((t) => ({ id: t.id, name: t.name, description: t.description })),
    /** Cấu hình "Thông tin hàng gửi" hiện hành (nền ENV → DB ghi đè). */
    parcel,
    /** Danh mục cho form Admin. */
    parcel_options: {
      goods_types: GOSHIP_GOODS_TYPES,
      goods_type_max: GOSHIP_GOODS_TYPE_MAX,
      /** Khoá metadata khai "loại hàng" trên variant/product. */
      goods_type_meta_key: GOSHIP_GOODS_TYPE_META_KEY,
      delivery_notes: GOSHIP_DELIVERY_NOTES.map((n) => ({ id: n.id, label: n.label })),
      declare_values: [
        { id: "off", label: "Không khai giá (0₫)" },
        { id: "order_total", label: "Khai theo tổng đơn" },
      ],
      payers: [
        { id: 0, label: "Khách trả" },
        { id: 1, label: "Shop trả" },
      ],
      weight_units: GOSHIP_WEIGHT_UNITS.map((u) => ({ id: u.id, label: u.label })),
      dimension_units: GOSHIP_DIMENSION_UNITS.map((u) => ({ id: u.id, label: u.label })),
    },
    origin: {
      city: process.env.GOSHIP_ORIGIN_CITY ?? null,
      district: process.env.GOSHIP_ORIGIN_DISTRICT ?? null,
      ward: process.env.GOSHIP_ORIGIN_WARD ?? null,
      name: process.env.GOSHIP_ORIGIN_NAME ?? null,
      phone: process.env.GOSHIP_ORIGIN_PHONE ?? null,
      address: process.env.GOSHIP_ORIGIN_ADDRESS ?? null,
      payer: Number(process.env.GOSHIP_PAYER ?? 1),
    },
  })
}

type PostBody = {
  enabled?: boolean
  action?: "register-webhook" | "unregister-webhook" | "set-parcel"
  /** Cấu hình "Thông tin hàng gửi" — chỉ ghi các khoá có mặt. */
  parcel?: Partial<GoshipParcelSettings>
}

export const POST = async (req: MedusaRequest<PostBody>, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const goship = req.scope.resolve<GoshipModule>("goship")
  const body = (req.body ?? {}) as PostBody

  // Đăng ký / hủy webhook GoShip (best-effort, cần token).
  if (body.action === "register-webhook" || body.action === "unregister-webhook") {
    try {
      const target = webhookUrl()
      if (body.action === "register-webhook") {
        if (!target.startsWith("http")) {
          return res.status(400).json({
            message:
              "Thiếu MEDUSA_BACKEND_URL — không biết URL công khai để đăng ký webhook.",
          })
        }
        const result = await goship.registerWebhook(target)
        logger.info(`[goship] webhook ${target} (đã tồn tại: ${result.already}).`)
        return res.json({ ok: true, action: body.action, endpoint: target, already: result.already })
      }
      const removed = await goship.unregisterWebhook(target)
      logger.info(`[goship] đã hủy ${removed} webhook ${target}.`)
      return res.json({ ok: true, action: body.action, endpoint: target, removed })
    } catch (err) {
      logger.error(`[goship] webhook action lỗi: ${String(err)}`)
      return res.status(502).json({ message: `GoShip webhook lỗi: ${(err as Error).message}` })
    }
  }

  // Lưu cấu hình "Thông tin hàng gửi" (chỉ khoá gửi lên bị ghi đè).
  if (body.action === "set-parcel" || body.parcel) {
    if (!body.parcel || typeof body.parcel !== "object") {
      return res.status(400).json({ message: "Thiếu `parcel` (đối tượng cấu hình)." })
    }
    try {
      const parcel = await goship.setParcelSettings(body.parcel)
      logger.info("[goship] đã lưu cấu hình 'Thông tin hàng gửi' (Admin UI).")
      return res.json({ ok: true, action: "set-parcel", parcel })
    } catch (err) {
      logger.error(`[goship] setParcelSettings lỗi: ${String(err)}`)
      return res
        .status(500)
        .json({ message: `Không lưu được cấu hình kiện hàng: ${(err as Error).message}` })
    }
  }

  // Mặc định: đặt cờ bật/tắt.
  if (typeof body.enabled !== "boolean") {
    return res.status(400).json({ message: "Thiếu `enabled` (true/false) hoặc `action`." })
  }
  try {
    const enabled = await goship.setEnabled(body.enabled)
    return res.json({ ok: true, toggle: { enabled, source: "db" } })
  } catch (err) {
    logger.error(`[goship] setEnabled lỗi: ${String(err)}`)
    return res.status(500).json({ message: `Không lưu được cấu hình: ${(err as Error).message}` })
  }
}
