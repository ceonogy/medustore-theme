import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import GoshipFulfillmentService from "./service"

/**
 * Fulfillment provider GoShip — resolve từ medusa-config:
 *
 *   modules: [{
 *     resolve: '@medusajs/medusa/fulfillment',
 *     options: { providers: [{ resolve: './src/modules/goship/fulfillment-provider', id: 'goship' }] }
 *   }]
 *
 * `identifier = "goship"` + `id: "goship"` → provider id trong DB là
 * `fp_goship_goship`.
 */
export default ModuleProvider(Modules.FULFILLMENT, {
  services: [GoshipFulfillmentService],
})
