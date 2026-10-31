import { Module } from "@medusajs/framework/utils"
import GoshipModuleService from "./service"

/**
 * Custom module GoShip — chứa cache danh mục địa giới (`goship_location`)
 * và service bọc REST client. Logic shipping nằm ở fulfillment provider
 * (`./fulfillment-provider`), khai báo riêng trong `@medusajs/medusa/fulfillment`
 * options của medusa-config.
 *
 * Đăng ký top-level: `{ resolve: "./src/modules/goship" }`
 * → resolve bằng `container.resolve("goship")`.
 */
export default Module("goship", { service: GoshipModuleService })
