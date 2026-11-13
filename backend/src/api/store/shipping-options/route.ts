import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listShippingOptionsForCartWithPricingWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Ghi đè `GET /store/shipping-options` (route lõi đăng ký TRƯỚC nên bị thay).
 *
 * Bản lõi chỉ dùng `listShippingOptionsForCartWorkflow` (không tính giá) → các
 * shipping option `calculated` (GoShip) trả về `amount: undefined`, khiến
 * storefront không hiển thị được cước. Bản này dùng
 * `listShippingOptionsForCartWithPricingWorkflow` để mỗi option có sẵn
 * `amount` + `calculated_price`, đúng định dạng option `flat` native.
 *
 * Việc lọc theo rule (`goship_enabled`, `enabled_in_store`, địa chỉ...) vẫn do
 * workflow lo, nên khi GoShip tắt thì option GoShip tự biến mất.
 */
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { cart_id, is_return } = req.filterableFields as {
    cart_id: string
    is_return?: boolean
  }

  const { result: shipping_options } =
    await listShippingOptionsForCartWithPricingWorkflow(req.scope).run({
      input: { cart_id, is_return: Boolean(is_return) },
    })

  res.json({ shipping_options })
}
