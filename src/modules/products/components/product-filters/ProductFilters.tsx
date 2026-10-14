import { useTranslations, type Locale } from "@i18n";
import type {
  FacetLabels,
  FilterGroup,
  FilterKey,
} from "../../../../types/global";
import {
  SORT_VALUES,
  compareSizes,
  emptyCatalogState,
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
 * Result count of a draft filter state — served by /api/filter-count, which
 * runs the same buildListing the listing route renders with (path scope
 * included), so it can never drift from the applied page. On failure the
 * last known count stays on the button; a zero is never invented.
 */
const fetchDraftCount = async (
  path: string,
  search: string,
  signal: AbortSignal,
): Promise<number | null> => {
  // `search` arrives with its leading "?" — join it as parameters of the
  // same query string, or the second "?" would be swallowed into `path`.
  const query = search.startsWith("?") ? search.slice(1) : search;
  const response = await fetch(
    `/api/filter-count?path=${encodeURIComponent(path)}${query ? `&${query}` : ""}`,
    {
      headers: { accept: "application/json" },
      signal,
    },
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { count?: number };
  return typeof data.count === "number" ? data.count : null;
};

/**
 * Listing toolbar + right-side filter drawer.
 *
 * The drawer edits a draft copy of the filter state: chips and the price
 * slider never navigate, the footer's "Hiển thị N sản phẩm" shows the live
 * result count of the draft and applies it with a hard redirect through the
 * same canonical contract as before. Toolbar chips (removals) and the sort
 * select navigate immediately, like the original panel.
 *
 * Every drawer option stays a plain `<a href>` to the canonical URL of the
 * resulting state — crawlable, and a working filter without JavaScript; the
 * click handler merely intercepts the navigation to edit the draft instead.
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

  const applied = useMemo(
    () => normalizeSearch(initialSearch, PASSTHROUGH_RESOLVERS).state,
    [initialSearch],
  );
  /** Draft edits live here; the applied state only changes on navigation. */
  const [draft, setDraft] = useState<CatalogState>(applied);
  useEffect(() => setDraft(applied), [applied]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [draftCount, setDraftCount] = useState<number | null>(null);
  /** Bumped by the drawer's clear-all so the slider remounts cleared. */
  const [priceResetKey, setPriceResetKey] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);

  /** Canonical URL (path + query) for a filter state. */
  const hrefFor = (next: CatalogState): string => {
    const target = resolveCanonical({ pageType, path: basePath, state: next });
    return `${target.path}${target.search}`;
  };

  const toggle = (
    source: CatalogState,
    key: FilterKey,
    value: string,
  ): CatalogState => {
    const current = source[key];
    // Sizes keep their canonical magnitude order (40 before s before m) so
    // the state mirrors what the URL round-trip would produce.
    const nextValues = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) =>
          key === "size" ? compareSizes(a, b) : a.localeCompare(b, "vi"),
        );

    return { ...source, [key]: nextValues, page: null };
  };

  const activeCount = activeFacetCount(applied);

  const formatPrice = (value: number): string =>
    convertToLocale({ amount: value, currencyCode: "VND" });

  /** "450.000 ₫ – 1.200.000 ₫", or one-sided when only one bound is set. */
  const priceLabel = (): string => {
    const { price_min: min, price_max: max } = applied;
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

  // Applied-filter chips (toolbar): plain removal links that navigate.
  const appliedPills = groups.flatMap((group) =>
    applied[group.key].map((value) => ({
      key: `${group.key}:${value}`,
      label: optionLabel(group, value),
      href: hrefFor(toggle(applied, group.key, value)),
    })),
  );

  if (applied.price_min !== null || applied.price_max !== null) {
    appliedPills.push({
      key: "price",
      label: priceLabel(),
      href: hrefFor({
        ...applied,
        price_min: null,
        price_max: null,
        page: null,
      }),
    });
  }

  // The draft's canonical target — path included, because a draft may move
  // the page (e.g. two categories leave a flat category page for /store),
  // and the count must follow the route the results would land on.
  const appliedTarget = useMemo(
    () => resolveCanonical({ pageType, path: basePath, state: applied }),
    [pageType, basePath, applied],
  );
  const draftTarget = useMemo(
    () => resolveCanonical({ pageType, path: basePath, state: draft }),
    [pageType, basePath, draft],
  );
  const draftIsApplied =
    draftTarget.path === appliedTarget.path &&
    draftTarget.search === appliedTarget.search;

  useEffect(() => {
    if (draftIsApplied) {
      setDraftCount(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchDraftCount(draftTarget.path, draftTarget.search, controller.signal)
        .then((count) => {
          if (count !== null) setDraftCount(count);
        })
        .catch(() => {
          /* aborted — the button keeps the last known count */
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftTarget, draftIsApplied]);

  const shownCount = draftIsApplied ? totalCount : (draftCount ?? totalCount);

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

  const applyDraft = () => {
    setIsDrawerOpen(false);
    window.location.assign(hrefFor(draft));
  };

  /** Clears the draft in place — no navigation until "Hiển thị". */
  const resetDraft = () => {
    setDraft({ ...emptyCatalogState(), sort: draft.sort });
    setDraftCount(null);
    setPriceResetKey((key) => key + 1);
  };

  // The slider edits the draft like every other chip: committed (debounced)
  // into the state, applied only when the shopper asks for the results.
  const onDraftPrice = (range: PriceRangeValue) => {
    if (!priceBounds) return;
    const { low, high } = sliderBounds(priceBounds);
    setDraft((current) => withPrice(current, range, low, high));
  };

  if (groups.length === 0 && activeCount === 0 && !priceBounds) {
    return null;
  }

  const sortLabels: Record<SortValue, string> = {
    newest: t("products.sort.newest"),
    price_asc: t("products.sort.priceAsc"),
    price_desc: t("products.sort.priceDesc"),
  };
  const currentSort: SortValue = applied.sort ?? "newest";
  const sortValue = (sort: SortValue): string =>
    hrefFor({ ...applied, sort: sort === "newest" ? null : sort, page: null });

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
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-ink px-4 text-sm font-medium transition-colors hover:bg-fog"
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
            className="-mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-fog"
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
                  const isActive = draft[group.key].includes(option.value);

                  return (
                    <a
                      key={option.value}
                      href={hrefFor(toggle(draft, group.key, option.value))}
                      aria-current={isActive ? "true" : undefined}
                      onClick={(event) => {
                        // With JS the click edits the draft; the href keeps
                        // the option a real, crawlable, no-JS filter link.
                        event.preventDefault();
                        setDraft(toggle(draft, group.key, option.value));
                      }}
                      className={`flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm transition-colors ${chipWidth(group.key)} ${
                        isActive
                          ? "border-ink bg-ink text-paper"
                          : "border-line text-ink hover:border-ink"
                      }`}
                    >
                      {option.label}
                    </a>
                  );
                })}
              </div>
            </section>
          ))}

          <PriceRange
            key={priceResetKey}
            bounds={priceBounds}
            value={draft}
            onCommit={onDraftPrice}
            locale={locale}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-4">
          <a
            href={basePath}
            onClick={(event) => {
              // Reset the draft in place; the href keeps it working without JS.
              event.preventDefault();
              resetDraft();
            }}
            className="flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm font-medium transition-colors hover:border-ink"
          >
            {t("products.filters.clearAll")}
          </a>
          <button
            type="button"
            onClick={applyDraft}
            className="min-h-11 flex-1 cursor-pointer rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-black/80"
          >
            {t("products.filters.showResults", { count: shownCount })}
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
