import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/sepay/config
 *
 * Cấu hình SePay cho trang Admin: URL webhook để dán vào my.sepay.vn, phương
 * thức xác thực, môi trường (test/live), và trạng thái provider theo từng
 * region (đang bật hay không).
 *
 * Secret KHÔNG bao giờ trả ở đây — chỉ trả bản đã che (`secret_masked`). Muốn
 * xem thật phải gọi `GET /admin/sepay/config/secret` (có ghi log audit).
 *
 * Route nằm dưới `/admin/*` nên yêu cầu đăng nhập admin (mặc định là session
 * cookie) — không lộ cấu hình ra ngoài.
 */
const SEPAY_PROVIDER_ID = "pp_sepay"

const trimSlash = (url: string) => url.replace(/\/+$/, "")

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const backendUrl = trimSlash(process.env.MEDUSA_BACKEND_URL ?? "")
  const webhookUrl = backendUrl
    ? `${backendUrl}/webhooks/sepay`
    : "/webhooks/sepay"

  const secret = process.env.SEPAY_WEBHOOK_SECRET
  const apiKey = process.env.SEPAY_WEBHOOK_API_KEY
  const authMethod = secret
    ? "HMAC_SHA256"
    : apiKey
      ? "API_KEY"
      : "NONE"

  const baseUrl = process.env.SEPAY_BASE_URL ?? ""

  let regions: {
    id: string
    name: string
    enabled: boolean
  }[] = []
  try {
    const { data } = await query.graph({
      entity: "region",
      fields: ["id", "name", "payment_providers.id"],
    })
    regions = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      enabled: (r.payment_providers ?? []).some(
        (p: any) => p?.id === SEPAY_PROVIDER_ID,
      ),
    }))
  } catch (err) {
    logger.warn(`SePay config: không đọc được region providers — ${String(err)}`)
  }

  res.json({
    provider: {
      id: SEPAY_PROVIDER_ID,
      registered: true,
      configured: Boolean(
        process.env.SEPAY_API_TOKEN && process.env.SEPAY_BANK_ACCOUNT_ID,
      ),
      mode: process.env.SEPAY_MODE ?? null,
      environment: baseUrl.includes("sandbox")
        ? "test"
        : baseUrl
          ? "live"
          : null,
      base_url: baseUrl || null,
      bank_account_id: process.env.SEPAY_BANK_ACCOUNT_ID ?? null,
    },
    webhook: {
      url: webhookUrl,
      auth_method: authMethod,
      has_secret: Boolean(secret),
      // Che mặc định — xem thật qua /admin/sepay/config/secret.
      secret_masked: secret ? "•".repeat(12) : null,
      secret_length: secret ? secret.length : null,
    },
    regions,
    regions_enabled_count: regions.filter((r) => r.enabled).length,
  })
}
