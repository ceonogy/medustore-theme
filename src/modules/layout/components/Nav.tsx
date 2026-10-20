import {
  I18N_ENABLED,
  LOCALES,
  localizePath,
  useTranslations,
  type Locale,
} from "@i18n";
import {
  $cartItemCount,
  $regionId,
  initCart,
  toggleCartSidebar,
} from "@lib/stores/cart";
import { hasSessionToken } from "@lib/auth";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { useHydrated } from "@lib/hooks/use-hydrated";

interface NavProps {
  locale: Locale;
  regionId: string | null;
  /** Full current pathname, used to build the language switcher links. */
  currentPath?: string;
}

export const Nav = ({ locale, regionId, currentPath = "/" }: NavProps) => {
  const cartItemCount = useStore($cartItemCount);
  // Hydration gate: show the SSR value (0) on the first client render so a
  // cart left in the store by a previous ClientRouter navigation cannot
  // mismatch the fresh SSR HTML (React #418).
  const hydrated = useHydrated();
  const displayedItemCount = hydrated ? cartItemCount : 0;
  const t = useTranslations(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  // Guests see "Tài khoản" as the login page; signed-in customers get the
  // dashboard. SSR always renders the guest href (no session server-side).
  const [accountHref, setAccountHref] = useState(
    localizePath(locale, "/tai-khoan/dang-nhap"),
  );

  useEffect(() => {
    let active = true;
    hasSessionToken().then((hasToken) => {
      if (active && hasToken) {
        setAccountHref(localizePath(locale, "/tai-khoan"));
      }
    });
    return () => {
      active = false;
    };
  }, [locale]);

  useEffect(() => {
    if (regionId) {
      $regionId.set(regionId);
      initCart();
    }
  }, [regionId]);

  // The ClientRouter swaps the document on navigation — close the sheet.
  useEffect(() => setMenuOpen(false), [currentPath]);

  // The cart lives in its own header button (count badge) — no menu entry.
  const links = [
    { href: localizePath(locale, "/store"), label: t("nav.products") },
    { href: accountHref, label: t("account.navLink") },
    { href: localizePath(locale, "/privacy"), label: t("footer.privacy") },
    { href: localizePath(locale, "/terms"), label: t("footer.terms") },
  ];
  const desktopLinks = links;

  return (
    <header
      className="reveal reveal-nav sticky top-0 z-40 w-full border-b border-line/70 bg-paper/90 backdrop-blur-md"
      data-reveal
    >
      <div className="wrap flex h-16 items-center justify-between gap-6 wide:h-20">
        <a
          href={localizePath(locale, "/")}
          className="text-base font-bold uppercase tracking-tight wide:text-lg"
        >
          {t("site.brand")}
        </a>

        <nav
          aria-label={t("nav.main")}
          className="hidden items-center gap-6 text-[16px] tablet:flex"
        >
          {desktopLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={
                currentPath === link.href ||
                currentPath.startsWith(`${link.href}/`)
                  ? "page"
                  : undefined
              }
              className="text-ink/70 transition-colors hover:text-ink aria-[current=page]:font-medium aria-[current=page]:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {I18N_ENABLED && (
            <nav
              aria-label={t("nav.language")}
              className="hidden items-center gap-2 text-sm tablet:flex"
            >
              {LOCALES.map((code) => (
                <a
                  key={code}
                  href={localizePath(code, currentPath)}
                  hrefLang={code}
                  aria-current={code === locale ? "true" : undefined}
                  className={
                    code === locale
                      ? "font-semibold underline underline-offset-4"
                      : "text-ink/55 hover:text-ink hover:underline"
                  }
                >
                  {code.toUpperCase()}
                </a>
              ))}
            </nav>
          )}

          <button
            type="button"
            onClick={() => toggleCartSidebar()}
            className="type-body relative font-medium hover:underline"
            aria-label={t("nav.cartAria", { count: displayedItemCount })}
          >
            <span aria-live="polite" aria-atomic="true">
              {t("nav.cartCount", { count: displayedItemCount })}
            </span>
          </button>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center tablet:hidden"
            aria-label={menuOpen ? t("nav.close") : t("nav.menu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="sr-only">
              {menuOpen ? t("nav.close") : t("nav.menu")}
            </span>
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path
                  d="M5 5l12 12M17 5L5 17"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6.5h16M3 11h16M3 15.5h16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-line bg-paper tablet:hidden">
          <nav
            aria-label={t("nav.menu")}
            className="wrap flex flex-col gap-5 py-6"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="type-label font-normal"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};
