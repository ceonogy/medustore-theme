import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type GoshipModuleService from "../../../../modules/goship/service"

/**
 * GET /store/goship/config
 *
 * Trả **đơn vị đo** mà shop đã khai trong Admin → GoShip, để storefront hiển thị
 * đúng nhãn (`g`/`kg`, `cm`/`m`).
 *
 * Vì Medusa không có cấu hình đơn vị cho `product.weight|length|width|height`
 * (đều là số trần), storefront chỉ cần BIẾT đơn vị shop chọn — giá trị lưu sẵn
 * đã ở đúng đơn vị đó, không cần quy đổi khi hiển thị.
 *
 * Chỉ trả 2 trường công khai, không lộ các cấu hình nội bộ khác.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const goship = req.scope.resolve<GoshipModuleService>("goship")
  try {
    const settings = await goship.getParcelSettings()
    return res.json({
      weight_unit: settings.weightUnit,
      dimension_unit: settings.dimensionUnit,
    })
  } catch (err) {
    req.scope
      .resolve<{ warn: (msg: string) => void }>(ContainerRegistrationKeys.LOGGER)
      .warn(`[goship] /store/goship/config lỗi: ${(err as Error)?.message}`)
    // Mặc định quy ước cũ (gram/cm) để storefront không vỡ.
    return res.json({ weight_unit: "g", dimension_unit: "cm" })
  }
}
