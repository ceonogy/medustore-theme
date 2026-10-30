import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /admin/sepay/config/secret
 *
 * Trả HMAC secret thật để admin dán vào my.sepay.vn. Mỗi lần gọi đều ghi log
 * audit (ai, từ IP nào) vì đây là hành động lộ bí mật. Trang Admin chỉ gọi khi
 * admin bấm nút "Hiện".
 */
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) => {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const actor = req.auth_context?.actor_id ?? "unknown"
  const forwarded = req.headers["x-forwarded-for"]
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown"

  logger.warn(
    `SePay: HMAC secret được hiện bởi admin "${actor}" (ip ${ip}) — audit.`,
  )

  const secret = process.env.SEPAY_WEBHOOK_SECRET
  if (!secret) {
    return res
      .status(404)
      .json({ message: "Chưa cấu hình SEPAY_WEBHOOK_SECRET trong .env." })
  }

  res.json({ secret })
}
