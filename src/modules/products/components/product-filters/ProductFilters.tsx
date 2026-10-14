import { useTranslations, type Locale } from "@i18n";
import type {
  FacetLabels,
  FilterGroup,
  FilterKey,
} from "../../../../types/global";
import {
  SORT_VALUES,
  compareSizes,
  normalizeSearch,
  resolveCanonical,
  type CatalogState,
  type PageType,
  type SortValue,
} from "../../../../lib/utils/canonical-query";
import type { PriceBounds } from "../../../../lib/utils/catalog";
import { facetOptionLabel } from "../../../../lib/utils/catalog";
import { convertToLocale } from "../../../../lib/utils/money";
import {
  sliderBounds,
  withPrice,
  type PriceRangeValue,
} from "../../../../lib/utils/price-range";
import { useEffect, useMemo, useRef, useState } from "react";
import { PriceRange } from "./PriceRange";

interface ProductFiltersProps {
  groups: FilterGroup[];
  /** Taxonomy-wide labels (value → name) for applied-filter chips whose
   *  selection fell outside this page's scoped option list. */
  optionLabels: FacetLabels;
  /** Path the request is rendered on (already canonical). */
  basePath: string;
  pageType: PageType;
  /** Query string of the request — normalised by the middleware, never raw. */
  initialSearch: string;
  /** Server-computed result count of the current filter state. */
  totalCount: number;
  /** Catalogue-wide price span anchoring the slider (null when unpriced). */
  priceBounds: PriceBounds;
  locale?: Locale;
}

/** Group headings come from the facet builders (untranslated data). */
const GROUP_LABEL_KEYS: Record<FilterKey, string> = {
  category: "products.filters.category",
  collection: "products.filters.collection",
  size: "products.filters.size",
  origin: "products.filters.origin",
};

/**
 * The query string was canonicalised before the page rendered, so these
 * values are already live slugs and need no taxonomy lookup here.
 */
const PASSTHROUGH_RESOLVERS = {
  resolveCategory: (value: string) => value,
  resolveCollection: (value: string) => value,
};

const activeFacetCount = (state: CatalogState): number =>
  state.category.length +
  state.collection.length +
  state.size.length +
  state.origin.length +
  state.color.length +
  state.brand.length +
  (state.price_min !== null || state.price_max !== null ? 1 : 0) +
  (state.sale ? 1 : 0) +
  (state.in_stock ? 1 : 0);

/** Uniform chip width so numeric sizes and S/M/L scan as one aligned row. */
const chipWidth = (key: FilterKey) =>
  key === "size" ? "min-w-14 justify-center px-2.5" : "";

/**
 * Listing toolbar + right-side filter drawer.
 *
 * Selection behaves exactly like the original filter panel: every option is
 * a plain `<a href>` to the canonical URL of the resulting state and the
 * click performs a hard redirect to it — the server then re-renders with
 * true counts, and the drawer closes naturally with the navigation. This is
 * also why the option links keep working (and crawlable) without JS.
 *
 * The counts shown are always the server's: the toolbar from `totalCount`,
 * applied chips' labels from the taxonomy-wide `optionLabels`.
 */
export const ProductFilters = ({
  groups,
  optionLabels,
  basePath,
  pageType,
  initialSearch,
  totalCount,
  priceBounds,
  locale,
}: ProductFiltersProps) => {
  const t = useTranslations(locale);

  const state = useMemo(
    () => normalizeSearch(initialSearch, PASSTHROUGH_RESOLVERS).state,
    [initialSearch],
  );

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /** Canonical URL (path + query) for a filter state. */
  const hrefFor = (next: CatalogState): string => {
    const target = resolveCanonical({ pageType, path: basePath, state: next });
    return `${target.path}${target.search}`;
  };

  /** The current state with one facet value toggled (applied instantly). */
  const toggle = (key: FilterKey, value: string): CatalogState => {
    const current = state[key];
    // Sizes keep their canonical magnitude order (40 before s before m) so
    // the state mirrors what the URL round-trip would produce.
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) =>
          key === "size" ? compareSizes(a, b) : a.localeCompare(b, "vi"),
        );

    return { ...state, [key]: nextValues, page: null };
  };

  const activeCount = activeFacetCount(state);

  const formatPrice = (value: number): string =>
    convertToLocale({ amount: value, currencyCode: "VND" });

  /** "450.000 ₫ – 1.200.000 ₫", or one-sided when only one bound is set. */
  const priceLabel = (): string => {
    const { price_min: min, price_max: max } = state;
    if (min !== null && max !== null)
      return `${formatPrice(min)} – ${formatPrice(max)}`;
    if (min !== null)
      return `${t("products.filters.priceFrom")} ${formatPrice(min)}`;
    if (max !== null)
      return `${t("products.filters.priceTo")} ${formatPrice(max)}`;
    return t("products.filters.price");
  };

  /** Label precedence: the rendered option (drawer chip and pill then read
   *  identically), then the taxonomy-wide map, then the value's own
   *  rendering (origin/size resolve locally either way). */
  const optionLabel = (group: FilterGroup, value: string): string =>
    group.options.find((option) => option.value === value)?.label ??
    optionLabels[group.key]?.[value] ??
    facetOptionLabel(group.key, value, locale);

  // Applied-filter chips (toolbar): plain removal links.
  const appliedPills = groups.flatMap((group) =>
    state[group.key].map((value) => ({
      key: `${group.key}:${value}`,
      label: optionLabel(group, value),
      href: hrefFor(toggle(group.key, value)),
    })),
  );

  if (state.price_min !== null || state.price_max !== null) {
    appliedPills.push({
      key: "price",
      label: priceLabel(),
      href: hrefFor({ ...state, price_min: null, price_max: null, page: null }),
    });
  }

  // The slider commits a hard navigation like any other filter — same code
  // path the pre-drawer panel used.
  const onPrice = (range: PriceRangeValue) => {
    if (!priceBounds) return;
    const { low, high } = sliderBounds(priceBounds);
    window.location.assign(hrefFor(withPrice(state, range, low, high)));
  };

  // Drawer focus management: move focus in, trap Tab, lock the page scroll
  // without letting the disappearing scrollbar resize the layout (CLS), and
  // return focus to the trigger on close.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
    panelRef.current
      ?.querySelector<HTMLElement>("[data-drawer-close]")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isDrawerOpen]);

  if (groups.length === 0 && activeCount === 0 && !priceBounds) {
    return null;
  }

  const sortLabels: Record<SortValue, string> = {
    newest: t("products.sort.newest"),
    price_asc: t("products.sort.priceAsc"),
    price_desc: t("products.sort.priceDesc"),
  };
  const currentSort: SortValue = state.sort ?? "newest";
  const sortValue = (sort: SortValue): string =>
    hrefFor({ ...state, sort: sort === "newest" ? null : sort, page: null });

  const resultText =
    totalCount === 1
      ? t("products.filters.resultSingular", { count: totalCount })
      : t("products.filters.resultPlural", { count: totalCount });

  return (
    <div className="mb-8">
      {/* Toolbar: count left; filter trigger + sort right. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <p className="type-body text-muted" aria-live="polite">
          {resultText}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-expanded={isDrawerOpen}
            aria-controls="product-filter-drawer"
            className="flex min-h-10 items-center gap-2 rounded-md border border-ink px-4 text-sm font-medium transition-colors hover:bg-fog"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M2.5 4.5h15l-6 7v5l-3 1.5v-6.5l-6-7z" />
            </svg>
            {t("products.filters.title")}
            {activeCount > 0 && (
              <span className="rounded-md bg-ink px-1.5 py-0.5 text-xs text-paper">
                {activeCount}
              </span>
            )}
          </button>

          <select
            aria-label={t("products.sort.label")}
            value={sortValue(currentSort)}
            onChange={(event) => window.location.assign(event.target.value)}
            className="h-10 rounded-md border border-line bg-paper px-3 text-sm text-ink transition-colors hover:border-ink focus:border-ink focus:outline-none"
          >
            {SORT_VALUES.map((sort) => (
              <option key={sort} value={sortValue(sort)}>
                {sortLabels[sort]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applied filters: removal links + clear all. */}
      {appliedPills.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {appliedPills.map((pill) => (
            <a
              key={pill.key}
              href={pill.href}
              aria-label={t("products.filters.removeFilter", {
                label: pill.label,
              })}
              className="flex min-h-9 items-center gap-2 rounded-md bg-fog px-3 text-sm transition-colors hover:bg-line"
            >
              {pill.label}
              <span aria-hidden="true">&times;</span>
            </a>
          ))}

          <a
            href={basePath}
            className="flex min-h-9 items-center px-2 text-sm underline hover:no-underline"
          >
            {t("products.filters.clearAll")}
          </a>
        </div>
      )}

      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setIsDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 motion-reduce:transition-none ${
          isDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <div
        ref={panelRef}
        id="product-filter-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-filter-drawer-title"
        inert={!isDrawerOpen}
        className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-paper transition-transform duration-300 ease-out motion-reduce:transition-none sm:max-w-md ${
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <h2
            id="product-filter-drawer-title"
            className="flex items-center gap-2 text-xl font-medium"
          >
            {t("products.filters.title")}
            {activeCount > 0 && (
              <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-normal text-paper">
                {activeCount}
              </span>
            )}
          </h2>
          <button
            type="button"
            data-drawer-close
            aria-label={t("products.filters.closeDrawer")}
            onClick={() => setIsDrawerOpen(false)}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-fog"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5">
          {groups.map((group, index) => (
            <section
              key={group.key}
              aria-labelledby={`drawer-group-${group.key}`}
              className={`flex flex-col gap-3 py-4 ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <h3
                id={`drawer-group-${group.key}`}
                className="text-sm font-medium text-ink"
              >
                {t(GROUP_LABEL_KEYS[group.key])}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => {
                  const isActive = state[group.key].includes(option.value);

                  return (
                    <a
                      key={option.value}
                      href={hrefFor(toggle(group.key, option.value))}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${chipWidth(group.key)} ${
                        isActive
                          ? "border-ink bg-ink text-paper"
                          : "border-line text-ink hover:border-ink"
                      }`}
                    >
                      {option.label}
                      <span
                        className={`text-xs ${isActive ? "text-paper/70" : "text-muted"}`}
                      >
                        {option.count}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ))}

          <PriceRange
            bounds={priceBounds}
            value={state}
            onCommit={onPrice}
            locale={locale}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-4">
          <a
            href={basePath}
            className="flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium transition-colors hover:border-ink"
          >
            {t("products.filters.clearAll")}
          </a>
          <button
            type="button"
            onClick={() => setIsDrawerOpen(false)}
            className="min-h-11 flex-1 rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-black/80"
          >
            {t("products.filters.showResults", { count: totalCount })}
          </button>
        </div>
      </div>

      {totalCount === 0 && (
        <p className="mt-8 text-sm text-muted">
          {t("products.filters.noResults")}{" "}
          <a href={basePath} className="underline hover:no-underline">
            {t("products.filters.clearAllFilters")}
          </a>{" "}
          {t("products.filters.noResultsHint")}
        </p>
      )}
    </div>
  );
};
