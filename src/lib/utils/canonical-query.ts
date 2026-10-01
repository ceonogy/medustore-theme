/**
 * The catalogue URL contract.
 *
 * Filter parameters are always slugs (never Medusa ids), always in a fixed
 * order, never repeated and never carrying unknown values. Anything that does
 * not match this canonical form is 301'd by the middleware, so crawlers only
 * ever see one URL per result set.
 *
 * Pure module: no SDK calls, no Astro — safe to import from middleware, from
 * server pages and from the filter island (hrefs must work before hydration).
 */

export const FILTER_PARAM_ORDER = [
  "category",
  "collection",
  "price_min",
  "price_max",
  "size",
  "origin",
  "color",
  "brand",
  "sale",
  "in_stock",
  "sort",
  "page",
] as const;

export type FilterParamKey = (typeof FILTER_PARAM_ORDER)[number];

export const SORT_VALUES = ["newest", "price_asc", "price_desc"] as const;
export type SortValue = (typeof SORT_VALUES)[number];

/** Path kinds that accept catalogue filter parameters. */
export type PageType = "store" | "category" | "collection" | "promotion";

export type CatalogState = {
  category: string[];
  collection: string[];
  price_min: number | null;
  price_max: number | null;
  size: string[];
  origin: string[];
  color: string[];
  brand: string[];
  sale: boolean;
  in_stock: boolean;
  sort: SortValue | null;
  page: number | null;
};

export const emptyCatalogState = (): CatalogState => ({
  category: [],
  collection: [],
  price_min: null,
  price_max: null,
  size: [],
  origin: [],
  color: [],
  brand: [],
  sale: false,
  in_stock: false,
  sort: null,
  page: null,
});

/** Params that identify a campaign and must survive normalisation untouched. */
const TRACKING_KEY =
  /^(utm_[a-z0-9_]+|fbclid|gclid|msclkid|ttclid|igshid|mc_eid|mc_cid|dclid|wbraid|gbraid|_ga)$/i;

/** Size order shoppers expect: numbers ascending, then S < M < L < XL … */
const SIZE_RANK: Record<string, number> = {
  s: 1,
  m: 2,
  l: 3,
  xl: 4,
  xxl: 5,
  xxxl: 6,
};

const isNumericSize = (value: string) => /^\d+$/.test(value);

export const compareSizes = (a: string, b: string): number => {
  const aNum = isNumericSize(a);
  const bNum = isNumericSize(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1;
  if (bNum) return 1;
  const rank = (SIZE_RANK[a] ?? 99) - (SIZE_RANK[b] ?? 99);
  return rank !== 0 ? rank : a.localeCompare(b);
};

const dedupeSorted = (values: string[]): string[] =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b));

/**
 * Values are read verbatim (ids are case-sensitive); only the resolved result
 * is a handle, and those are lowercase. `Giay-Dep` and `giay-dep` are the same
 * category, so a hand-typed value gets one second chance in lower case.
 */
const readRawList = (params: URLSearchParams, key: FilterParamKey): string[] =>
  params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

const readList = (params: URLSearchParams, key: FilterParamKey): string[] =>
  readRawList(params, key).map((value) => value.toLowerCase());

const throughTaxonomy =
  (resolve: (value: string) => string | null) =>
  (value: string): string | null => {
    const exact = resolve(value);
    if (exact) return exact;
    const lower = value.toLowerCase();
    return lower === value ? null : resolve(lower);
  };

/** `1.500.000`, `1500000` and `1500000đ` all mean the same amount. */
const parseAmount = (raw: string | null): number | null => {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
};

const parseSaleFlag = (params: URLSearchParams, key: "sale" | "in_stock") => {
  const raw = params.get(key);
  if (raw === null) return false;
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
};

export type NormalizedSearch = {
  state: CatalogState;
  /** Campaign params, in their original order — kept on redirect targets. */
  tracking: [string, string][];
  /** Params we do not manage (e.g. `?ref=`): preserved, never canonicalised. */
  passthrough: [string, string][];
  /** True when the raw search held at least one catalogue filter key. */
  hasFilterParams: boolean;
};

/**
 * Reads a query string into a validated state:
 * repeated keys *and* comma lists, ids resolved through the taxonomy,
 * unknown values dropped, prices swapped/rounded, `page=1` removed.
 */
export const normalizeSearch = (
  search: string,
  resolvers: {
    resolveCategory: (value: string) => string | null;
    resolveCollection: (value: string) => string | null;
  },
): NormalizedSearch => {
  const params = new URLSearchParams(search);
  const state = emptyCatalogState();

  const hasFilterParams = FILTER_PARAM_ORDER.some((key) => params.has(key));

  state.category = dedupeSorted(
    readRawList(params, "category")
      .map(throughTaxonomy(resolvers.resolveCategory))
      .filter((value): value is string => Boolean(value)),
  );
  state.collection = dedupeSorted(
    readRawList(params, "collection")
      .map(throughTaxonomy(resolvers.resolveCollection))
      .filter((value): value is string => Boolean(value)),
  );

  let priceMin = parseAmount(params.get("price_min"));
  let priceMax = parseAmount(params.get("price_max"));
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    [priceMin, priceMax] = [priceMax, priceMin];
  }
  state.price_min = priceMin;
  state.price_max = priceMax;

  state.size = [...new Set(readList(params, "size"))].sort(compareSizes);
  state.origin = dedupeSorted(readList(params, "origin"));
  state.color = dedupeSorted(readList(params, "color"));
  state.brand = dedupeSorted(readList(params, "brand"));

  state.sale = parseSaleFlag(params, "sale");
  state.in_stock = parseSaleFlag(params, "in_stock");

  // `newest` is the default order — asking for it explicitly is redundant, so
  // it normalises away and `?sort=newest` 301s onto the clean URL.
  const sort = params.get("sort")?.trim().toLowerCase();
  state.sort =
    sort &&
    sort !== "newest" &&
    (SORT_VALUES as readonly string[]).includes(sort)
      ? (sort as SortValue)
      : null;

  const page = Number.parseInt(params.get("page") ?? "", 10);
  state.page = Number.isFinite(page) && page > 1 ? page : null;

  const managed = new Set<string>(FILTER_PARAM_ORDER);
  const tracking: [string, string][] = [];
  const passthrough: [string, string][] = [];
  for (const [key, value] of params.entries()) {
    if (managed.has(key)) continue;
    if (TRACKING_KEY.test(key)) tracking.push([key, value]);
    else passthrough.push([key, value]);
  }

  return { state, tracking, passthrough, hasFilterParams };
};

/** Filters that always stop the collapse to a clean category/collection URL. */
const blocksCollapse = (state: CatalogState): boolean =>
  state.price_min !== null ||
  state.price_max !== null ||
  state.size.length > 0 ||
  state.origin.length > 0 ||
  state.color.length > 0 ||
  state.brand.length > 0 ||
  state.sale ||
  state.in_stock;

/**
 * The query string of a state, in FILTER_PARAM_ORDER.
 *
 * Assembled by hand instead of through `URLSearchParams`, which would turn the
 * comma in `category=a,b` into `%2C` — the target of a redirect must be
 * byte-identical to the canonical URL a browser then requests, or the two
 * would keep redirecting each other. Values are always ASCII slugs/numbers, so
 * nothing needs escaping. `skip` omits a param that moved into the path.
 */
export const serializeCatalogState = (
  state: CatalogState,
  skip?: FilterParamKey,
): string => {
  const parts: string[] = [];
  const add = (key: FilterParamKey, value: string) => {
    if (key !== skip) parts.push(`${key}=${value}`);
  };
  // Lists are re-sorted here so the canonical form is a property of the URL,
  // not of whoever built the state (the island toggles values one at a time).
  const list = (key: FilterParamKey, values: string[]) => {
    if (!values.length) return;
    const ordered =
      key === "size"
        ? [...values].sort(compareSizes)
        : [...values].sort((a, b) => a.localeCompare(b));
    add(key, ordered.join(","));
  };

  // Push order = FILTER_PARAM_ORDER.
  list("category", state.category);
  list("collection", state.collection);
  if (state.price_min !== null) add("price_min", String(state.price_min));
  if (state.price_max !== null) add("price_max", String(state.price_max));
  list("size", state.size);
  list("origin", state.origin);
  list("color", state.color);
  list("brand", state.brand);
  if (state.sale) add("sale", "true");
  if (state.in_stock) add("in_stock", "true");
  if (state.sort && state.sort !== "newest") add("sort", state.sort);
  if (state.page !== null) add("page", String(state.page));

  return parts.join("&");
};

export type CanonicalTarget = { path: string; search: string };

/**
 * The URL a given filter state must live on.
 *
 * - one category and nothing else  -> /{handle}
 * - one collection and nothing else -> /bo-suu-tap/{handle}
 * - everything else stays on /store (or on the category/collection path it
 *   was requested from, which carries its own selection)
 */
export const resolveCanonical = (input: {
  pageType: PageType;
  /** Path the request is on; for `store` it may collapse to a clean URL. */
  path: string;
  state: CatalogState;
  tracking?: [string, string][];
  passthrough?: [string, string][];
}): CanonicalTarget => {
  const { pageType, state } = input;
  let path = input.path;
  // The param the path now carries — it must leave the query, or the URL
  // would say the same thing twice (`/giay-dep?category=giay-dep`).
  let moved: FilterParamKey | undefined;

  if (pageType === "store" && !blocksCollapse(state)) {
    if (state.category.length === 1 && state.collection.length === 0) {
      path = `/${state.category[0]}`;
      moved = "category";
    } else if (state.category.length === 0 && state.collection.length === 1) {
      path = `/bo-suu-tap/${state.collection[0]}`;
      moved = "collection";
    }
  }

  const filters = serializeCatalogState(state, moved);
  const extras = [...(input.tracking ?? []), ...(input.passthrough ?? [])]
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  const search = [filters, extras].filter(Boolean).join("&");

  return { path, search: search ? `?${search}` : "" };
};
