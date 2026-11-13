import enabled from "./enabled";
import type { AddonClientConfig, AddonRegistry } from "./types";

/**
 * Addon slot registry.
 *
 * Themes render optional integration points through these slots:
 * - `addons.goship?.AddressFields` — checkout province/district/ward cascade
 * - `addons.goship?.getUnits` — g/kg + cm/m labels on product pages
 * - `addons.sepay?.PaymentPanel` — bank-transfer QR/VA panel
 *
 * Each slot is `undefined` when the addon is not installed, and every caller
 * must provide a sensible fallback (plain text inputs / no panel / g+cm).
 */
export const addons: AddonRegistry = enabled;

/** Backend URL + publishable key the addon components should call. */
export const addonClientConfig = (): AddonClientConfig => ({
  // Browser: same-origin `/medusa` proxy (see src/middleware.ts).
  // SSR: talk to the backend directly.
  baseUrl:
    typeof window === "undefined"
      ? (import.meta.env.PUBLIC_MEDUSA_BACKEND_URL ?? "")
      : `${window.location.origin}/medusa`,
  publishableKey: import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
});

export type {
  AddonRegistry,
  GoshipAddon,
  GoshipAddressFieldsProps,
  GoshipAddressValue,
  GoshipSelectProps,
  SepayAddon,
  SepayPaymentPanelProps,
} from "./types";
