import {
  DEFAULT_LOCALE,
  I18N_ENABLED,
  LOCALES,
  isLocale,
  normalizeLocale,
  type Locale,
} from "./config";
import * as core from "./dictionaries/core";
import * as cart from "./dictionaries/cart";
import * as checkout from "./dictionaries/checkout";
import * as order from "./dictionaries/order";
import * as products from "./dictionaries/products";

type Dict = Record<string, string>;

/**
 * Dictionaries are split per area so feature teams can edit one file without
 * conflicting. They are merged once at module load.
 */
const merge = (...dicts: Dict[]): Dict => Object.assign({}, ...dicts);

const UI: Record<Locale, Dict> = {
  vi: merge(core.vi, cart.vi, checkout.vi, order.vi, products.vi),
  en: merge(core.en, cart.en, checkout.en, order.en, products.en),
};

export const SUPPORTED_LOCALES = LOCALES;

/** Builds a translation function bound to a locale. */
export const useTranslations = (locale?: Locale | string | null) => {
  const lang = normalizeLocale(locale);
  const dict = UI[lang] ?? UI[DEFAULT_LOCALE];
  const fallback = UI[DEFAULT_LOCALE];

  return (key: string, vars?: Record<string, string | number>) => {
    let value = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{{${name}}}`, String(replacement));
      }
    }
    return value;
  };
};

export type Translator = ReturnType<typeof useTranslations>;

/**
 * Builds a locale-aware path: the default locale is unprefixed, others are not.
 *
 *   localizePath("vi", "/store") -> "/store"
 *   localizePath("en", "/store") -> "/en/store"
 */
export const localizePath = (locale: Locale | string | null, path: string) => {
  const lang = normalizeLocale(locale);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (lang === DEFAULT_LOCALE) return normalized === "/" ? "/" : normalized;
  return normalized === "/" ? `/${lang}` : `/${lang}${normalized}`;
};

/** Removes a locale prefix from a path so it can be re-prefixed for another locale. */
export const stripLocalePrefix = (path: string) => {
  const parts = path.split("/");
  const [, first] = parts;
  if (first && isLocale(first)) {
    const rest = parts.slice(2).join("/");
    return rest ? `/${rest}` : "/";
  }
  return path;
};

export { DEFAULT_LOCALE, I18N_ENABLED, LOCALES, isLocale, normalizeLocale };
export type { Locale };
