import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import SePayPaymentProvider from "./service"

/**
 * Payment provider SePay — resolve từ medusa-config:
 *
 *   modules: [{
 *     resolve: '@medusajs/medusa/payment',
 *     options: { providers: [{ resolve: './src/modules/sepay/payment-provider', options: {...} }] }
 *   }]
 *
 * Không khai báo `id` → payment provider id trong DB là `pp_sepay`.
 */
export default ModuleProvider(Modules.PAYMENT, {
  services: [SePayPaymentProvider],
})
