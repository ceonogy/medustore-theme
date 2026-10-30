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
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { useHydrated } from "@lib/hooks/use-hydrated";

interface NavCollection {
  label: string;
  href: string;
  image?: string;
}

interface NavProps {
  locale: Locale;
  regionId: string | null;
  /** Full current pathname, used to build the language switcher links. */
  currentPath?: string;
  /** Collections with products — the mega menu content (server-computed). */
  collections?: NavCollection[];
  /** Products flagged metadata.featured in the Medusa admin (max 5). */
  featured?: NavCollection[];
}

export const Nav = ({
  locale,
  regionId,
  currentPath = "/",
  collections = [],
  featured = [],
}: NavProps) => {
  const cartItemCount = useStore($cartItemCount);
  // Hydration gate: show the SSR value (0) on the first client render so a
  // cart left in the store by a previous ClientRouter navigation cannot
  // mismatch the fresh SSR HTML (React #418).
  const hydrated = useHydrated();
  const displayedItemCount = hydrated ? cartItemCount : 0;
  const t = useTranslations(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  // Desktop menus: which dropdown is open ("featured" | "collections").
  // Drives data-mega-open + aria; the visual open state is pure CSS.
  const [megaOpen, setMegaOpen] = useState<"featured" | "collections" | null>(
    null,
  );
  // Mobile accordions: "Nổi bật" and "Bộ sưu tập" are separate entries.
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
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

  // The ClientRouter swaps the document on navigation — close every panel.
  useEffect(() => {
    cancelMegaClose();
    setMenuOpen(false);
    setMegaOpen(null);
    setFeaturedOpen(false);
    setExploreOpen(false);
  }, [currentPath]);

  // Drop any pending close timer on unmount.
  useEffect(() => () => cancelMegaClose(), []);

  // Desktop dropdowns: visibility is pure CSS (`:has()` on the header —
  // see global.css) so a panel opens on hover even when this island has
  // not hydrated. React only mirrors aria-expanded and applies the Escape
  // lock: after Escape the panels stay shut under the cursor until the
  // pointer leaves and re-enters the trigger.
  const headerRef = useRef<HTMLElement>(null);

  // The account (user icon) and cart (icon + count badge) live in the
  // top-right icon cluster — no text entries in the menu. Desktop shows
  // three entries: "Khám phá" is a plain link to the store, "Nổi Bật" opens
  // its own featured-products dropdown, "Bộ sưu tập" opens the collections
  // mega — privacy/terms live in the footer only.
  const isAccountPage = currentPath.startsWith("/tai-khoan");
  const storeHref = localizePath(locale, "/store");
  const hasFeatured = featured.length > 0;
  const hasCollections = collections.length > 0;

  // Trigger + panel handlers shared by both dropdowns. Mouse leave does
  // NOT drop the open id immediately: the cursor travelling from the title
  // into the panel passes a dead zone, and an instant drop could blink the
  // panel shut before the pointer arrives (seen with slow pointers and
  // under prefers-reduced-motion). Hold data-mega-open for a 200ms beat —
  // entering either the panel or the trigger again cancels the pending
  // close. The CSS hover bridge in global.css covers the same crossing
  // for the no-JS case. 350ms also covers a cursor that crawls the gap
  // at ~80px/s; abandoning the menu still fades it within ~750ms.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelMegaClose = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const enterMega = (id: "featured" | "collections") => () => {
    cancelMegaClose();
    headerRef.current?.removeAttribute("data-mega-locked");
    setMegaOpen(id);
  };
  const enterPanel = (id: "featured" | "collections") => () => {
    cancelMegaClose();
    setMegaOpen(id);
  };
  const scheduleMegaClose = (id: "featured" | "collections") => () => {
    cancelMegaClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setMegaOpen((open) => (open === id ? null : open));
    }, 350);
  };
  const focusMega =
    (id: "featured" | "collections") =>
    (event: FocusEvent<HTMLButtonElement>) => {
      // Mouse click focuses too — only keyboard focus opens.
      if (event.currentTarget.matches(":focus-visible")) setMegaOpen(id);
    };

  // Mirror the open state onto the header as data-mega-open="featured" |
  // "collections" so the CSS `:has()` rules also open the right panel for a
  // click/tap at desktop width (no hover on touch devices). A pointerdown
  // outside the header closes it.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    if (megaOpen) header.setAttribute("data-mega-open", megaOpen);
    else header.removeAttribute("data-mega-open");
  }, [megaOpen]);

  useEffect(() => {
    if (!megaOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const inside = target instanceof Element && target.closest("header");
      if (!inside) setMegaOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [megaOpen]);

  return (
    <header
      ref={headerRef}
      className="reveal reveal-nav sticky top-0 z-40 w-full border-b border-line/70 bg-paper/90 backdrop-blur-md"
      data-reveal
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        cancelMegaClose();
        setMegaOpen(null);
        setMenuOpen(false);
        setFeaturedOpen(false);
        setExploreOpen(false);
        headerRef.current?.setAttribute("data-mega-locked", "true");
      }}
      onBlur={(event) => {
        // Focus left every trigger and both panels — collapse the dropdown.
        const next = event.relatedTarget;
        if (
          megaOpen &&
          (!next ||
            (!next.closest("#mega-collections") &&
              !next.closest("#mega-featured") &&
              !next.closest("[data-mega-trigger]")))
        ) {
          setMegaOpen(null);
        }
      }}
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
          <a
            href={storeHref}
            aria-current={
              currentPath === storeHref ||
              currentPath.startsWith(`${storeHref}/`)
                ? "page"
                : undefined
            }
            className="text-ink/70 transition-colors hover:text-ink aria-[current=page]:font-medium aria-[current=page]:text-ink"
          >
            {t("nav.explore")}
          </a>
          {hasFeatured && (
            <button
              type="button"
              data-mega-trigger="featured"
              aria-expanded={megaOpen === "featured"}
              aria-controls="mega-featured"
              onMouseEnter={enterMega("featured")}
              onMouseLeave={scheduleMegaClose("featured")}
              onFocus={focusMega("featured")}
              onClick={() => setMegaOpen("featured")}
              className="text-ink/70 transition-colors hover:text-ink aria-[expanded=true]:font-medium aria-[expanded=true]:text-ink"
            >
              {t("nav.megaFeatured")}
            </button>
          )}
          {hasCollections && (
            <button
              type="button"
              data-mega-trigger="collections"
              aria-expanded={megaOpen === "collections"}
              aria-controls="mega-collections"
              onMouseEnter={enterMega("collections")}
              onMouseLeave={scheduleMegaClose("collections")}
              onFocus={focusMega("collections")}
              onClick={() => setMegaOpen("collections")}
              className="text-ink/70 transition-colors hover:text-ink aria-[expanded=true]:font-medium aria-[expanded=true]:text-ink"
            >
              {t("nav.megaCollections")}
            </button>
          )}
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

      {hasFeatured && (
        <div
          id="mega-featured"
          onMouseEnter={enterPanel("featured")}
          onMouseLeave={scheduleMegaClose("featured")}
          className="absolute inset-x-0 top-full hidden border-t border-line bg-paper tablet:block"
        >
          {/* Its own dropdown for "Nổi Bật": the products flagged
              metadata.featured in the Medusa admin (max 5, newest first).
              Scrolls internally on short viewports. */}
          <div className="wrap max-h-[calc(100dvh-5rem)] overflow-y-auto py-6">
            <p className="type-label">{t("nav.megaFeatured")}</p>
            <ul className="mt-5 grid max-w-3xl grid-cols-5 gap-5">
              {featured.map((product) => (
                <li key={product.href}>
                  <a href={product.href} className="group block">
                    <div className="aspect-[3/4] overflow-hidden border border-line bg-fog">
                      {product.image && (
                        <img
                          src={product.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                        />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug underline-offset-4 group-hover:underline">
                      {product.label}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {hasCollections && (
        <div
          id="mega-collections"
          onMouseEnter={enterPanel("collections")}
          onMouseLeave={scheduleMegaClose("collections")}
          className="absolute inset-x-0 top-full hidden border-t border-line bg-paper tablet:block"
        >
          {/* Collections only — "Nổi Bật" lives in its own dropdown. The
              panel scrolls internally on short viewports so every card
              stays reachable. */}
          <div className="wrap max-h-[calc(100dvh-5rem)] overflow-y-auto py-6">
            <p className="type-label">{t("nav.megaCollections")}</p>
            <ul className="mt-5 grid max-w-3xl grid-cols-4 gap-5">
              <li>
                <a href={storeHref} className="group/all block">
                  <div className="flex aspect-[3/4] items-center justify-center border border-line bg-fog text-ink/50 transition-colors group-hover/all:text-ink">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 26 26"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 18L18 8M18 8H10.5M18 8v7.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="mt-2.5 text-sm font-medium underline-offset-4 group-hover/all:underline">
                    {t("nav.megaAll")}
                  </p>
                </a>
              </li>
              {collections.map((collection) => (
                <li key={collection.href}>
                  <a href={collection.href} className="group block">
                    <div className="aspect-[3/4] overflow-hidden border border-line bg-fog">
                      {collection.image && (
                        <img
                          src={collection.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                        />
                      )}
                    </div>
                    <p className="mt-2.5 text-sm font-medium underline-offset-4 group-hover:underline">
                      {collection.label}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Mobile drawer: always mounted so open/close animates (grid-rows
          height + fade — see .nav-drawer in global.css) instead of flashing
          in. `inert` on the collapsed wrapper keeps its links out of the tab
          order until the hamburger opens it. */}
      <div className="tablet:hidden">
        <div
          className="nav-drawer"
          data-open={menuOpen ? "true" : "false"}
          inert={!menuOpen}
        >
          <div className="border-t border-line bg-paper">
            <nav
              aria-label={t("nav.menu")}
              className="wrap flex flex-col gap-4 py-6"
            >
              <a href={storeHref} className="type-label font-normal">
                {t("nav.explore")}
              </a>
              {hasFeatured && (
                <>
                  <button
                    type="button"
                    aria-expanded={featuredOpen}
                    aria-controls="featured-sheet"
                    onClick={() => setFeaturedOpen((open) => !open)}
                    className="flex items-center justify-between type-label font-normal"
                  >
                    {t("nav.megaFeatured")}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      className={`transition-transform motion-reduce:transition-none ${
                        featuredOpen ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        d="M3 5l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {featuredOpen && (
                    <div
                      id="featured-sheet"
                      className="mega-in flex flex-col gap-3 pl-1"
                    >
                      {featured.map((product) => (
                        <a
                          key={product.href}
                          href={product.href}
                          className="text-sm text-ink/70"
                        >
                          {product.label}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
              {hasCollections && (
                <>
                  <button
                    type="button"
                    aria-expanded={exploreOpen}
                    aria-controls="explore-sheet"
                    onClick={() => setExploreOpen((open) => !open)}
                    className="flex items-center justify-between type-label font-normal"
                  >
                    {t("nav.megaCollections")}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                      className={`transition-transform motion-reduce:transition-none ${
                        exploreOpen ? "rotate-180" : ""
                      }`}
                    >
                      <path
                        d="M3 5l4 4 4-4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  {exploreOpen && (
                    <div
                      id="explore-sheet"
                      className="mega-in flex flex-col gap-3 pl-1"
                    >
                      <a href={storeHref} className="text-sm text-ink/70">
                        {t("nav.megaAll")}
                      </a>
                      {collections.map((collection) => (
                        <a
                          key={collection.href}
                          href={collection.href}
                          className="text-sm text-ink/70"
                        >
                          {collection.label}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
