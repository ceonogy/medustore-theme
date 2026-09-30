/**
 * Locale configuration for the storefront.
 *
 * Follows Astro's official i18n routing guide
 * (https://docs.astro.build/en/guides/internationalization/):
 * the default locale has no URL prefix, every other locale does.
 */
export const LOCALES = ["vi", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Vietnamese-first: served at the domain root with no `/vi/` prefix. */
export const DEFAULT_LOCALE: Locale = "vi";

export const isLocale = (value?: string | null): value is Locale =>
  !!value && (LOCALES as readonly string[]).includes(value);

/** Normalises anything Astro hands us (`"en"`, `"en-US"`, `undefined`) to a Locale. */
export const normalizeLocale = (value?: string | null): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const base = value.toLowerCase().split("-")[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
};
