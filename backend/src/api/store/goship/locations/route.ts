import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type GoshipModuleService from "../../../../modules/goship/service"

/**
 * GET /store/goship/locations
 *
 * Danh mục **tỉnh/thành** (63 đơn vị) của GoShip để đổ vào dropdown đầu tiên
 * ở form checkout. Không cần đăng nhập — dữ liệu công khai, giống danh mục
 * quốc gia của Medusa.
 *
 * Trả kèm `code` (GoShip city id) mà storefront phải lưu lại cùng `name`,
 * vì khi tính phí / tạo vận đơn GoShip chỉ nhận mã số.
 *
 * Lỗi: khi cache trống và GoShip không gọi được → 502, `provinces: []`, để
 * form checkout hiển thị thông báo thay vì vỡ.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const goship = req.scope.resolve<GoshipModuleService>("goship")
  try {
    const provinces = await goship.getProvinces()
    return res.json({ provinces })
  } catch (err) {
    req.scope
      .resolve<{ warn: (msg: string) => void }>(ContainerRegistrationKeys.LOGGER)
      .warn(`[goship] /store/goship/locations lỗi: ${(err as Error)?.message}`)
    return res.status(502).json({
      message: "Không tải được danh mục tỉnh/thành. Vui lòng thử lại.",
      provinces: [],
    })
  }
}
