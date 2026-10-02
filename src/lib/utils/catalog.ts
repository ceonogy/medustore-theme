import type {
  FilterGroup,
  FilterKey,
  ProductVariant,
} from "../../types/global";
import {
  compareSizes,
  type CatalogState,
  type SortValue,
} from "./canonical-query.ts";

/**
 * Server-side catalogue logic: filter, sort, paginate and count.
 *
 * Phase A runs this over the product list already loaded by the store page —
 * the demo catalogue is two dozen products, so one Medusa call plus an
 * in-memory pass is cheaper and far simpler than shaping a facet engine.
 * The limits are stated in the phase report; if the catalogue grows to
 * thousands of items the same functions move behind the search index
 * (`/store/search`, Postgres FTS) without touching the URL contract above.
 */

export const CATALOG_PAGE_SIZE = 12;

/** The minimum shape these helpers need from a Medusa store product. */
export type CatalogProduct = {
  id?: string;
  created_at?: string | Date | null;
  origin_country?: string | null;
  categories?: { id: string; name: string; handle?: string | null }[] | null;
  collection?: { id: string; title: string; handle?: string | null } | null;
  /** Product-level options: the id → title lookup for variant options. */
  options?: { id: string; title?: string | null }[] | null;
  variants?: ProductVariant[] | null;
};

export type CatalogOptions = {
  /** Handles the URL path already selects (category pages include descendants). */
  pathCategories?: string[];
  /** Exact handle in the URL path — never offered as a facet of its own page. */
  primaryCategory?: string;
  /** Handle the URL path already selects (collection pages). */
  pathCollection?: string | null;
  /** Locale for data-shaped labels (country names), defaulting to Vietnamese. */
  locale?: string;
};

const amountsFor = (product: CatalogProduct): number[] =>
  (product.variants ?? [])
    .map((variant) => variant.calculated_price?.calculated_amount)
    .filter((amount): amount is number => typeof amount === "number");

/** Lowest calculated price of a product's variants, or null when unpriced. */
export const minAmount = (product: CatalogProduct): number | null => {
  const amounts = amountsFor(product);
  return amounts.length ? Math.min(...amounts) : null;
};

export const maxAmount = (product: CatalogProduct): number | null => {
  const amounts = amountsFor(product);
  return amounts.length ? Math.max(...amounts) : null;
};

export type PriceBounds = { min: number; max: number } | null;

/**
 * Catalogue-wide price span, used to anchor the slider on every listing page.
 *
 * Deliberately computed from the whole product set, not the current result:
 * the handles must not jump around as other filters change (that would move
 * the very prices the shopper is trying to set).
 */
export const priceBoundsOf = (products: CatalogProduct[]): PriceBounds => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const product of products) {
    const amounts = amountsFor(product);
    if (!amounts.length) continue;
    min = Math.min(min, ...amounts);
    max = Math.max(max, ...amounts);
  }

  return min === Number.POSITIVE_INFINITY ? null : { min, max };
};

/**
 * A product matches a price range when at least one of its variant prices
 * falls inside it — the rule shop sliders follow for multi-variant items (a
 * shoe offered at 400k and 900k still belongs to a "from 500k" filter).
 * Unpriced products drop out as soon as either bound is set: the range cannot
 * place them.
 */
const priceInRange = (
  product: CatalogProduct,
  priceMin: number | null,
  priceMax: number | null,
): boolean => {
  if (priceMin === null && priceMax === null) return true;

  return amountsFor(product).some(
    (amount) =>
      (priceMin === null || amount >= priceMin) &&
      (priceMax === null || amount <= priceMax),
  );
};

const categoryHandles = (product: CatalogProduct): string[] =>
  (product.categories ?? []).map((category) => category.handle ?? category.id);

const collectionHandle = (product: CatalogProduct): string | null =>
  product.collection?.handle ?? product.collection?.id ?? null;

/**
 * Option titles the catalogue uses for sizes. Live products say "Kích cỡ";
 * the English "Size" only appears on non-visible products, but is matched
 * anyway so publishing one later cannot silently break the facet.
 */
const SIZE_OPTION_TITLES = new Set(["kích cỡ", "size"]);

const isSizeTitle = (title: string | null | undefined): boolean =>
  Boolean(title && SIZE_OPTION_TITLES.has(title.toLowerCase()));

/** The size values a product offers, in canonical (lowercase) URL form. */
export const sizeValuesOf = (product: CatalogProduct): string[] => {
  const titleByOptionId = new Map(
    (product.options ?? []).map((option) => [option.id, option.title]),
  );
  const values = new Set<string>();

  for (const variant of product.variants ?? []) {
    for (const option of variant.options ?? []) {
      const title =
        option.option?.title ?? titleByOptionId.get(option.option_id ?? "");
      if (!isSizeTitle(title) || !option.value) continue;
      values.add(option.value.toLowerCase());
    }
  }

  return [...values];
};

/** The product's ISO-2 origin in lowercase, or null when it carries none. */
export const originOf = (product: CatalogProduct): string | null => {
  const origin = product.origin_country?.trim().toLowerCase();
  return origin || null;
};

/**
 * How a facet value reads in the UI.
 *
 * Country names come from the platform's locale-aware region lookup — the
 * exact call the product detail page makes — so the facet and the attribute
 * table can never disagree. Letter sizes get their natural casing.
 */
export const facetOptionLabel = (
  key: FilterKey,
  value: string,
  locale?: string,
): string => {
  if (key === "origin") {
    try {
      const name = new Intl.DisplayNames([locale ?? "vi"], {
        type: "region",
      }).of(value.toUpperCase());
      return name || value;
    } catch {
      return value;
    }
  }
  if (key === "size") return /^\d+$/.test(value) ? value : value.toUpperCase();
  return value;
};

/**
 * OR inside a facet group, AND across groups — the behaviour shoppers expect
 * from faceted navigation. `pathCategories`/`pathCollection` act as an extra
 * selection that the query string cannot remove (it lives in the URL path).
 */
export const filterCatalog = <T extends CatalogProduct>(
  products: T[],
  state: CatalogState,
  options: CatalogOptions = {},
): T[] => {
  const categorySelection = [
    ...(options.pathCategories ?? []),
    ...state.category,
  ];
  const collectionSelection = options.pathCollection
    ? [options.pathCollection, ...state.collection]
    : state.collection;
  const { price_min: priceMin, price_max: priceMax, size, origin } = state;

  if (
    !categorySelection.length &&
    !collectionSelection.length &&
    priceMin === null &&
    priceMax === null &&
    !size.length &&
    !origin.length
  ) {
    return products;
  }

  return products.filter((product) => {
    if (categorySelection.length) {
      const handles = categoryHandles(product);
      if (!categorySelection.some((handle) => handles.includes(handle))) {
        return false;
      }
    }

    if (collectionSelection.length) {
      const handle = collectionHandle(product);
      if (!handle || !collectionSelection.includes(handle)) return false;
    }

    // Products without the attribute can never match a selection of it —
    // a bag has no size, and a product with no origin is unplaceable.
    if (size.length) {
      const sizes = sizeValuesOf(product);
      if (!size.some((value) => sizes.includes(value))) return false;
    }
    if (origin.length) {
      const productOrigin = originOf(product);
      if (!productOrigin || !origin.includes(productOrigin)) return false;
    }

    return priceInRange(product, priceMin, priceMax);
  });
};

const createdAtTime = (product: CatalogProduct): number => {
  const value = product.created_at;
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
};

const byNewest = <T extends CatalogProduct>(a: T, b: T): number =>
  createdAtTime(b) - createdAtTime(a);

export const sortCatalog = <T extends CatalogProduct>(
  products: T[],
  sort: SortValue | null | undefined,
): T[] => {
  if (sort !== "price_asc" && sort !== "price_desc") {
    return [...products].sort(byNewest);
  }

  const direction = sort === "price_asc" ? 1 : -1;

  return [...products].sort((a, b) => {
    const priceA = minAmount(a);
    const priceB = minAmount(b);
    // Unpriced products always sink, keeping their relative newest-first order.
    if (priceA === null && priceB === null) return byNewest(a, b);
    if (priceA === null) return 1;
    if (priceB === null) return -1;
    if (priceA === priceB) return byNewest(a, b);
    return (priceA - priceB) * direction;
  });
};

export type PaginatedCatalog<T> = {
  items: T[];
  count: number;
  page: number;
  pageCount: number;
  /** Requested page lies past the last one → the caller answers with a 404. */
  beyond: boolean;
};

export const paginateCatalog = <T>(
  items: T[],
  page: number | null | undefined,
  pageSize: number = CATALOG_PAGE_SIZE,
): PaginatedCatalog<T> => {
  const count = items.length;
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const current = page && page > 0 ? page : 1;
  const beyond = current > pageCount;

  return {
    items: beyond
      ? []
      : items.slice((current - 1) * pageSize, current * pageSize),
    count,
    page: current,
    pageCount,
    beyond,
  };
};

const tally = <T extends CatalogProduct>(
  products: T[],
  read: (product: T) => string[],
  label: (product: T, value: string) => string,
): Map<string, { label: string; count: number }> => {
  const counts = new Map<string, { label: string; count: number }>();
  products.forEach((product) => {
    const seen = new Set<string>();
    read(product).forEach((value) => {
      if (!value || seen.has(value)) return;
      seen.add(value);
      const existing = counts.get(value);
      counts.set(value, {
        label: existing?.label ?? label(product, value),
        count: (existing?.count ?? 0) + 1,
      });
    });
  });
  return counts;
};

/**
 * Facet options with counts, derived from the current result set: a group's
 * counts ignore that group's own selection (so siblings stay clickable) and
 * options with zero products never appear.
 */
export const buildFacetGroups = <T extends CatalogProduct>(
  products: T[],
  state: CatalogState,
  options: CatalogOptions = {},
): FilterGroup[] => {
  const categoryBase = filterCatalog(
    products,
    { ...state, category: [] },
    options,
  );
  const collectionBase = filterCatalog(
    products,
    { ...state, collection: [] },
    options,
  );
  const sizeBase = filterCatalog(products, { ...state, size: [] }, options);
  const originBase = filterCatalog(products, { ...state, origin: [] }, options);

  // The page itself is the path selection: it cannot be toggled off from its
  // own facet, so its handle never appears as an option of that facet.
  const categories = tally(
    categoryBase,
    (product) =>
      categoryHandles(product).filter(
        (handle) => handle !== options.primaryCategory,
      ),
    (product, handle) =>
      product.categories?.find(
        (category) => (category.handle ?? category.id) === handle,
      )?.name ?? handle,
  );

  const collections = tally(
    collectionBase,
    (product) => {
      const handle = collectionHandle(product);
      return handle && handle !== options.pathCollection ? [handle] : [];
    },
    (product) => product.collection?.title ?? "",
  );

  const sizes = tally(
    sizeBase,
    (product) => sizeValuesOf(product),
    (_product, value) => facetOptionLabel("size", value),
  );

  const origins = tally(
    originBase,
    (product) => {
      const origin = originOf(product);
      return origin ? [origin] : [];
    },
    (_product, value) => facetOptionLabel("origin", value, options.locale),
  );

  const toOptions = (
    source: Map<string, { label: string; count: number }>,
    key: FilterKey,
  ): FilterGroup["options"] => {
    const options = [...source.entries()].map(([value, { label, count }]) => ({
      value,
      label,
      count,
    }));
    // Sizes order by magnitude (30 < 40 < S < M < L) — labels would sort
    // them alphabetically; every other group reads alphabetically by label.
    if (key === "size") {
      return options.sort((a, b) => compareSizes(a.value, b.value));
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "vi"));
  };

  const groups: FilterGroup[] = [
    {
      key: "category",
      label: "Category",
      options: toOptions(categories, "category"),
    },
    {
      key: "collection",
      label: "Collection",
      options: toOptions(collections, "collection"),
    },
    { key: "size", label: "Size", options: toOptions(sizes, "size") },
    { key: "origin", label: "Origin", options: toOptions(origins, "origin") },
  ];

  return groups.filter((group) => group.options.length > 0);
};
