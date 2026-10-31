import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type GoshipModuleService from "../../../../../modules/goship/service"

/**
 * GET /store/goship/locations/wards?district_code=700100
 *
 * Danh mục **phường/xã** của một quận/huyện GoShip (dropdown cấp 3).
 * `district_code` là `code` của district đã chọn ở
 * `/store/goship/locations/districts`.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const districtCode = String(req.query.district_code ?? "").trim()
  if (!districtCode) {
    return res.status(400).json({
      message: "Thiếu tham số district_code.",
      wards: [],
    })
  }

  const goship = req.scope.resolve<GoshipModuleService>("goship")
  try {
    const wards = await goship.getWards(districtCode)
    return res.json({ wards })
  } catch (err) {
    req.scope
      .resolve<{ warn: (msg: string) => void }>(ContainerRegistrationKeys.LOGGER)
      .warn(`[goship] /store/goship/locations/wards lỗi: ${(err as Error)?.message}`)
    return res.status(502).json({
      message: "Không tải được danh mục phường/xã. Vui lòng thử lại.",
      wards: [],
    })
  }
}
