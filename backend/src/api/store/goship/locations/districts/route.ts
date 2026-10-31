import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type GoshipModuleService from "../../../../../modules/goship/service"

/**
 * GET /store/goship/locations/districts?city_code=700000
 *
 * Danh mục **quận/huyện** của một tỉnh/thành GoShip (dropdown cấp 2).
 * `city_code` là `code` của province đã chọn ở `/store/goship/locations`.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const cityCode = String(req.query.city_code ?? "").trim()
  if (!cityCode) {
    return res.status(400).json({
      message: "Thiếu tham số city_code.",
      districts: [],
    })
  }

  const goship = req.scope.resolve<GoshipModuleService>("goship")
  try {
    const districts = await goship.getDistricts(cityCode)
    return res.json({ districts })
  } catch (err) {
    req.scope
      .resolve<{ warn: (msg: string) => void }>(ContainerRegistrationKeys.LOGGER)
      .warn(`[goship] /store/goship/locations/districts lỗi: ${(err as Error)?.message}`)
    return res.status(502).json({
      message: "Không tải được danh mục quận/huyện. Vui lòng thử lại.",
      districts: [],
    })
  }
}
