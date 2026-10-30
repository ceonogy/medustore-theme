import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

type PasswordResetEvent = {
  entity_id: string
  actor_type: string
  token: string
  metadata?: Record<string, unknown>
}

/**
 * Emails the password-reset link when `auth.password_reset` fires — the
 * event the store route POST /auth/customer/emailpass/reset-password
 * emits after generating the token.
 *
 * Security model (native Medusa, verified in the installed version):
 *  - the reset route always answers 201 with an empty body, whether or
 *    not the identifier exists — the token leaves the backend only via
 *    this mail, so there is no account-enumeration channel;
 *  - the token is a purpose-bound JWT (15-minute TTL) whose jti is
 *    stored hashed in `auth_password_reset_token`; the update route
 *    atomically consumes it (single-use) and rejects session bearers;
 *  - the mail link carries the token in the URL FRAGMENT (`#…`) so it
 *    never appears in access logs or Referer headers.
 *
 * The same event fires for admin users — only customers get mail.
 */
export default async function passwordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  if (data.actor_type !== "customer" || !data.entity_id || !data.token) {
    return
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications([
      {
        to: data.entity_id,
        channel: "email",
        template: "password-reset",
        data: { token: data.token, entity_id: data.entity_id },
      },
    ])
  } catch (error) {
    logger.error(
      `auth.password_reset ${data.entity_id}: reset mail failed: ${String(error)}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
}
