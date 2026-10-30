import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import BrevoNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [BrevoNotificationProviderService],
})
