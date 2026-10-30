import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type VerificationRequestedEvent = {
  entity_id: string
  entity_type: string
  code_provider: string
  auth_identity_id: string
  code: string
  expires_at: string
  metadata?: Record<string, unknown>
}

/**
 * Delivers the verification code (`auth.verification_requested`) by email.
 *
 * Medusa generates the code and puts it in the event payload — delivery is
 * up to the subscriber (see the Events Reference: "decide how to deliver the
 * code to the user or customer"). The OTP signup/confirm UI on the storefront
 * calls POST /auth/verification/request + /auth/verification/confirm, which
 * both flow through the existing /medusa proxy unchanged.
 */
export default async function verificationRequestedHandler({
  event: { data },
  container,
}: SubscriberArgs<VerificationRequestedEvent>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    if (!data.entity_id?.includes("@")) {
      logger.info(
        `auth.verification_requested: non-email entity "${data.entity_id}" (${data.entity_type}), skipping mail`,
      )
      return
    }

    const notification = container.resolve(Modules.NOTIFICATION)
    await notification.createNotifications([
      {
        to: data.entity_id,
        channel: "email",
        template: "verification-code",
        data: {
          code: data.code,
          expires_at: data.expires_at,
          code_provider: data.code_provider,
        },
      },
    ])
  } catch (error) {
    logger.error(
      `auth.verification_requested for ${data.entity_id}: mail failed: ${String(error)}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "auth.verification_requested",
}
