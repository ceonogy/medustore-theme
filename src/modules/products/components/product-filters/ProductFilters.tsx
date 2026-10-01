import { useTranslations, type Locale } from "@i18n";
import type { FilterGroup, FilterKey } from "../../../../types/global";
import {
  normalizeSearch,
  resolveCanonical,
  type CatalogState,
  type PageType,
} from "../../../../lib/utils/canonical-query";
import { useMemo, useState } from "react";

interface ProductFiltersProps {
  groups: FilterGroup[];
  /** Path the request is rendered on (already canonical). */
  basePath: string;
  pageType: PageType;
  /** Query string of the request — normalised by the middleware, never raw. */
  initialSearch: string;
  /** Server-computed result count of the current filter state. */
  totalCount: number;
  locale?: Locale;
}

/** Group headings come from the facet builders (untranslated data). */
const GROUP_LABEL_KEYS: Record<FilterKey, string> = {
  category: "products.filters.category",
  collection: "products.filters.collection",
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
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) => a.localeCompare(b));

    return { ...state, [key]: nextValues, page: null };
  };

  const activeCount = activeFacetCount(state);

  const activePills = groups.flatMap((group) =>
    state[group.key].map((value) => ({
      key: group.key,
      value,
      label:
        group.options.find((option) => option.value === value)?.label ?? value,
    })),
  );

  if (groups.length === 0 && activeCount === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setIsDrawerOpen((open) => !open)}
          aria-expanded={isDrawerOpen}
          aria-controls="product-filter-panel"
          className="flex min-h-11 items-center gap-2 rounded-full border border-black px-5 text-sm font-medium transition-colors hover:bg-gray-100 lg:hidden"
        >
          {t("products.filters.title")}
          {activeCount > 0 && (
            <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white">
              {activeCount}
            </span>
          )}
        </button>

        <p className="text-sm text-gray-500" aria-live="polite">
          {totalCount === 1
            ? t("products.filters.resultSingular", { count: totalCount })
            : t("products.filters.resultPlural", { count: totalCount })}
        </p>
      </div>

      <div
        id="product-filter-panel"
        className={`${isDrawerOpen ? "flex" : "hidden"} mt-4 flex-col gap-6 lg:mt-0 lg:flex lg:flex-row lg:flex-wrap lg:items-start lg:gap-8`}
      >
        {groups.map((group) => (
          <fieldset key={group.key} className="flex flex-col gap-3">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t(GROUP_LABEL_KEYS[group.key])}
            </legend>
            <div className="flex flex-wrap gap-2">
              {group.options.map((option) => {
                const isActive = state[group.key].includes(option.value);

                return (
                  <a
                    key={option.value}
                    href={hrefFor(toggle(group.key, option.value))}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-gray-300 text-black hover:bg-gray-100"
                    }`}
                  >
                    {option.label}
                    <span
                      className={`ml-2 text-xs ${isActive ? "text-gray-300" : "text-gray-500"}`}
                    >
                      {option.count}
                    </span>
                  </a>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {activePills.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {activePills.map((pill) => (
            <a
              key={`${pill.key}-${pill.value}`}
              href={hrefFor(toggle(pill.key, pill.value))}
              aria-label={t("products.filters.removeFilter", {
                label: pill.label,
              })}
              className="flex min-h-11 items-center gap-2 rounded-full bg-gray-100 px-4 text-sm transition-colors hover:bg-gray-200"
            >
              {pill.label}
              <span aria-hidden="true">&times;</span>
            </a>
          ))}

          <a
            href={basePath}
            className="flex min-h-11 items-center px-2 text-sm underline hover:no-underline"
          >
            {t("products.filters.clearAll")}
          </a>
        </div>
      )}

      {totalCount === 0 && (
        <p className="mt-8 text-sm text-gray-500">
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
