import { useTranslations, type Locale } from "@i18n";
import type { FilterGroup, FilterKey } from "../../../../types/global";
import {
  compareSizes,
  normalizeSearch,
  resolveCanonical,
  type CatalogState,
  type PageType,
} from "../../../../lib/utils/canonical-query";
import type { PriceBounds } from "../../../../lib/utils/catalog";
import { facetOptionLabel } from "../../../../lib/utils/catalog";
import { convertToLocale } from "../../../../lib/utils/money";
import { useMemo, useState } from "react";
import { PriceRange } from "./PriceRange";

interface ProductFiltersProps {
  groups: FilterGroup[];
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

/**
 * The filter rail for every listing page.
 *
 * Every option and every active chip is a plain `<a href>` pointing at the
 * canonical URL for the resulting state — crawlable, and usable before this
 * island hydrates. Hydration only powers the mobile drawer; the grid itself
 * stays static Astro markup owned by the server-rendered page.
 */
export const ProductFilters = ({
  groups,
  basePath,
  pageType,
  initialSearch,
  totalCount,
  priceBounds,
  locale,
}: ProductFiltersProps) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const t = useTranslations(locale);

  const state = useMemo(
    () => normalizeSearch(initialSearch, PASSTHROUGH_RESOLVERS).state,
    [initialSearch],
  );

  /** Canonical URL (path + query) for a filter state. */
  const hrefFor = (next: CatalogState): string => {
    const target = resolveCanonical({ pageType, path: basePath, state: next });
    return `${target.path}${target.search}`;
  };

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

  const pills = groups.flatMap((group) =>
    state[group.key].map((value) => ({
      key: `${group.key}:${value}`,
      // A selection can outlive its option (the path scope may not carry it),
      // so the label falls back to the value's own rendering.
      label:
        group.options.find((option) => option.value === value)?.label ??
        facetOptionLabel(group.key, value, locale),
      href: hrefFor(toggle(group.key, value)),
    })),
  );

  if (state.price_min !== null || state.price_max !== null) {
    pills.push({
      key: "price",
      label: priceLabel(),
      href: hrefFor({ ...state, price_min: null, price_max: null, page: null }),
    });
  }

  if (groups.length === 0 && activeCount === 0 && !priceBounds) {
    return null;
  }

  /** Size chips get a uniform width so the numeric and S/M/L values line up
   *  as one scannable row; the other groups keep their natural width. */
  const chipWidth = (key: FilterKey) =>
    key === "size" ? "min-w-14 justify-center px-2.5" : "";

  return (
    <div className="mb-8">
      <div className="mb-4 flex lg:hidden">
        <button
          type="button"
          onClick={() => setIsDrawerOpen((open) => !open)}
          aria-expanded={isDrawerOpen}
          aria-controls="product-filter-panel"
          className="flex min-h-10 items-center gap-2 rounded-md border border-ink px-4 text-sm font-medium transition-colors hover:bg-fog"
        >
          {t("products.filters.title")}
          {activeCount > 0 && (
            <span className="rounded-md bg-ink px-2 py-0.5 text-xs text-paper">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <div
        id="product-filter-panel"
        className={`${isDrawerOpen ? "block" : "hidden"} overflow-hidden rounded-2xl border border-line bg-paper lg:block`}
      >
        {groups.map((group, index) => (
          <section
            key={group.key}
            aria-labelledby={`filter-group-${group.key}`}
            className={`flex flex-col gap-3 px-5 py-4 tablet:flex-row tablet:gap-6 ${
              index > 0 ? "border-t border-line" : ""
            }`}
          >
            <h3
              id={`filter-group-${group.key}`}
              className="type-kicker shrink-0 pt-1.5 text-muted tablet:w-32"
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
                    className={`flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors ${chipWidth(group.key)} ${
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
          state={state}
          hrefFor={hrefFor}
          locale={locale}
        />
      </div>

      {pills.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {pills.map((pill) => (
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
