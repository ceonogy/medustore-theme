/**
 * Locale configuration for the storefront.
 *
 * Follows Astro's official i18n routing guide
 * (https://docs.astro.build/en/guides/internationalization/): the default
 * locale has no URL prefix, every other locale does.
 *
 * The layer is switchable: with `PUBLIC_I18N_ENABLED` unset (or not "true") the
 * store is Vietnamese-only — no `/en/*` URLs, no language switcher in the UI,
 * and every translation call resolves to `DEFAULT_LOCALE`. Set the variable to
 * `true` to bring both back, with no code change.
 */

/** Every locale this theme knows about, enabled or not. */
export const ALL_LOCALES = ["vi", "en"] as const;

export type Locale = (typeof ALL_LOCALES)[number];

/** Vietnamese-first: served at the domain root with no `/vi/` prefix. */
export const DEFAULT_LOCALE: Locale = "vi";

/** Language switcher + locale URLs. Off by default (single-language store). */
export const I18N_ENABLED =
  (import.meta.env.PUBLIC_I18N_ENABLED ?? "").trim().toLowerCase() === "true";

/** The locales actually published while i18n is off: the default one only. */
export const LOCALES: readonly Locale[] = I18N_ENABLED
  ? ALL_LOCALES
  : [DEFAULT_LOCALE];

/** Prefix detection still knows every locale, so `/en/*` can be redirected. */
export const isLocale = (value?: string | null): value is Locale =>
  !!value && (ALL_LOCALES as readonly string[]).includes(value);

/** Normalises anything Astro hands us (`"en"`, `"en-US"`, `undefined`) to a Locale. */
export const normalizeLocale = (value?: string | null): Locale => {
  // Single-language mode: whatever the caller asked for, we serve the default.
  if (!I18N_ENABLED) return DEFAULT_LOCALE;
  if (!value) return DEFAULT_LOCALE;
  const base = value.toLowerCase().split("-")[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
};
