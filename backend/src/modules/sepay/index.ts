import { Module } from "@medusajs/framework/utils"
import SePayModuleService from "./service"

/**
 * Custom module SePay — chỉ chứa bảng đối soát webhook
 * (`sepay_webhook_event`) + service dedup. Toàn bộ logic thanh toán nằm ở
 * payment provider (`./payment-provider`), được khai báo riêng trong
 * `@medusajs/medusa/payment` options của medusa-config.
 *
 * Đăng ký top-level: `{ resolve: "./src/modules/sepay" }`
 * → resolve bằng `container.resolve("sepay")`.
 */
export default Module("sepay", { service: SePayModuleService })
