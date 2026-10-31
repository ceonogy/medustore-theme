import {
  listShippingOptionsForCartWorkflow,
  listShippingOptionsForCartWithPricingWorkflow,
} from "@medusajs/medusa/core-flows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import {
  GOSHIP_RULE_ATTRIBUTE,
  goshipFlagValue,
  isGoshipEnabled,
} from "../../modules/goship/config"

/**
 * Bật/tắt GoShip ở checkout bằng cơ chế **rule + context** của Medusa.
 *
 * Mỗi shipping option GoShip có rule `goship_enabled eq "true"`. Ở đây ta bom
 * giá trị cờ hiện tại vào context mà Medusa dùng để lọc option
 * (`isContextValid`). Khi GoShip tắt, cờ = `"false"` → rule fail → mọi option
 * GoShip bị ẩn, chỉ còn 2 option `flat` (giá cố định) của provider `manual`.
 *
 * **Nguồn cờ = Admin UI**: đọc từ module `goship` (`goship_setting` trong DB),
 * dự phòng `GOSHIP_ENABLED` khi DB chưa cấu hình. Vì vậy bật/tắt trong Admin có
 * hiệu lực ngay ở request kế tiếp, không cần restart / build lại.
 *
 * Fail-closed: nếu không đọc được cờ vì bất kỳ lý do gì thì trả `"false"`
 * (ẩn GoShip) — chọn giá cố định an toàn hơn là hiện cước chưa xác thực.
 *
 * Phải đăng ký cho CẢ HAI workflow vì checkout dùng
 * `listShippingOptionsForCartWithPricingWorkflow` (đã override route) còn các
 * luồng khác (vd admin/khác) dùng bản không có pricing — Medusa khuyến nghị giữ
 * context nhất quán giữa hai workflow.
 *
 * File này nằm trong `src/workflows/**` nên được WorkflowLoader import lúc boot;
 * việc đăng ký hook là side-effect của import.
 */
const resolveEnabled = async (container: MedusaContainer): Promise<boolean> => {
  try {
    const goship = container.resolve<{ isEnabled(): Promise<boolean> }>("goship")
    return await goship.isEnabled()
  } catch {
    // Module chưa sẵn sàng → dùng dự phòng ENV (mặc định TẮT).
    return isGoshipEnabled()
  }
}

const setGoshipContext = async (_input: unknown, { container }: { container: MedusaContainer }) =>
  new StepResponse({
    [GOSHIP_RULE_ATTRIBUTE]: goshipFlagValue(await resolveEnabled(container)),
  })

listShippingOptionsForCartWorkflow.hooks.setShippingOptionsContext(setGoshipContext)
listShippingOptionsForCartWithPricingWorkflow.hooks.setShippingOptionsContext(setGoshipContext)

export {}
