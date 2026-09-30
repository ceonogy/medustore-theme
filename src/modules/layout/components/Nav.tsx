import {
  I18N_ENABLED,
  LOCALES,
  localizePath,
  stripLocalePrefix,
  useTranslations,
  type Locale,
} from "@i18n";
import {
  $cartItemCount,
  $regionId,
  initCart,
  toggleCartSidebar,
} from "@lib/stores/cart";
import { useStore } from "@nanostores/react";
import { useEffect } from "react";

interface NavProps {
  locale: Locale;
  regionId: string | null;
  /** Full current pathname, used to build the language switcher links. */
  currentPath?: string;
}

export const Nav = ({ locale, regionId, currentPath = "/" }: NavProps) => {
  const cartItemCount = useStore($cartItemCount);
  const t = useTranslations(locale);

  useEffect(() => {
    if (regionId) {
      $regionId.set(regionId);
      initCart();
    }
  }, [regionId]);

  const handleCartClick = () => {
    toggleCartSidebar();
  };

  const basePath = stripLocalePrefix(currentPath);

  return (
    <header className="flex items-center w-full p-8 h-24">
      <div className="flex items-center gap-6 flex-1">
        <a
          href={localizePath(locale, "/store")}
          className="text-sm hover:underline"
        >
          {t("nav.products")}
        </a>

        {/* Language switcher — only rendered when PUBLIC_I18N_ENABLED turns
            locale URLs back on; a single-language store shows no language UI. */}
        {I18N_ENABLED && (
          <nav
            aria-label={t("nav.language")}
            className="flex items-center gap-2 text-sm"
          >
            {LOCALES.map((code) => (
              <a
                key={code}
                href={localizePath(code, basePath)}
                hrefLang={code}
                aria-current={code === locale ? "true" : undefined}
                className={
                  code === locale
                    ? "font-semibold underline underline-offset-4"
                    : "text-black/55 hover:text-black hover:underline"
                }
              >
                {code.toUpperCase()}
              </a>
            ))}
          </nav>
        )}
      </div>

      <a
        href={localizePath(locale, "/")}
        className="text-sm font-bold uppercase tracking-wide"
      >
        {t("site.brand")}
      </a>

      <div className="flex items-center gap-6 flex-1 justify-end">
        <button
          onClick={handleCartClick}
          className="text-sm hover:underline relative"
          aria-label={t("nav.cartAria", { count: cartItemCount })}
        >
          <span aria-live="polite" aria-atomic="true">
            {t("nav.cartCount", { count: cartItemCount })}
          </span>
        </button>
      </div>
    </header>
  );
};
