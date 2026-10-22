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

  // The account (user icon) and cart (icon + count badge) live in the
  // top-right icon cluster — no text entries in the menu.
  const isAccountPage = currentPath.startsWith("/tai-khoan");
  const links = [
    { href: localizePath(locale, "/store"), label: t("nav.products") },
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

          <a
            href={accountHref}
            aria-label={t("account.navLink")}
            aria-current={isAccountPage ? "page" : undefined}
            className="flex h-10 w-10 items-center justify-center text-ink/70 transition-colors hover:text-ink aria-[current=page]:text-ink"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="7.5"
                r="3.75"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M3.75 19.25a7.25 7.25 0 0 1 14.5 0"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </a>

          <button
            type="button"
            onClick={() => toggleCartSidebar()}
            className="relative flex h-10 w-10 items-center justify-center text-ink/70 transition-colors hover:text-ink"
            aria-label={t("nav.cartAria", { count: displayedItemCount })}
          >
            <span aria-live="polite" aria-atomic="true" className="sr-only">
              {t("nav.cartCount", { count: displayedItemCount })}
            </span>
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 3.25h2.1l2.05 9.9a1.6 1.6 0 0 0 1.57 1.29h7.55a1.6 1.6 0 0 0 1.56-1.25l1.32-5.65H5.4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="8.75"
                cy="18.25"
                r="1.35"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle
                cx="15.75"
                cy="18.25"
                r="1.35"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            {displayedItemCount > 0 && (
              <span className="absolute -top-0.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] leading-none font-semibold text-paper">
                {displayedItemCount > 99 ? "99+" : displayedItemCount}
              </span>
            )}
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
