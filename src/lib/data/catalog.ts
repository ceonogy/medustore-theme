import type { HttpTypes } from "@medusajs/types";
import type { FacetLabels, FilterGroup, FilterKey } from "../../types/global";
import {
  normalizeSearch,
  emptyCatalogState,
  compareSizes,
  type CatalogState,
} from "../utils/canonical-query";
import {
  buildFacetGroups,
  facetOptionLabel,
  filterCatalog,
  paginateCatalog,
  priceBoundsOf,
  sortCatalog,
  type CatalogOptions,
  type PriceBounds,
} from "../utils/catalog";
import { listProducts } from "./products";
import {
  categoryPathHandles,
  getTaxonomy,
  type CategoryNode,
  type Taxonomy,
} from "./taxonomy";

/**
 * One listing page (store, category, collection, promotion) — loaded, filtered,
 * sorted, counted and paginated in a single place so those routes stay thin.
 *
 * The middleware already canonicalised the query string before we render, so
 * the values parsed here are the valid ones and need no taxonomy lookup.
 */
const PASSTHROUGH_RESOLVERS = {
  resolveCategory: (value: string) => value,
  resolveCollection: (value: string) => value,
};

export type CatalogListing = {
  state: CatalogState;
  /** Current page of results (empty when `beyond`). */
  products: HttpTypes.StoreProduct[];
  /** Shown when the filters match nothing — products from outside the result. */
  suggestions: HttpTypes.StoreProduct[];
  groups: FilterGroup[];
  /** Every category/collection handle's human label — for applied chips. */
  optionLabels: FacetLabels;
  totalCount: number;
  page: number;
  pageCount: number;
  /** Catalogue-wide price span anchoring the slider (null when unpriced). */
  priceBounds: PriceBounds;
  /** The requested page lies past the last one → the route answers 404. */
  beyond: boolean;
};

const pickSuggestions = (
  all: HttpTypes.StoreProduct[],
  selected: HttpTypes.StoreProduct[],
  options: CatalogOptions,
): HttpTypes.StoreProduct[] => {
  const selectedIds = new Set(selected.map((product) => product.id));
  const others = all.filter((product) => !selectedIds.has(product.id));

  // Prefer products still inside the path selection (same category/collection)
  // so a dead-end filter suggests close alternatives first.
  const inPath = filterCatalog(others, emptyCatalogState(), options);
  const inPathIds = new Set(inPath.map((product) => product.id));
  const rest = others.filter((product) => !inPathIds.has(product.id));

  return [...inPath, ...rest].slice(0, 4);
};

/** English literals mirror what buildFacetGroups uses for its group labels
 *  (the drawer renders translated headings of its own). */
const GROUP_FALLBACK_LABELS: Record<FilterKey, string> = {
  category: "Category",
  collection: "Collection",
  size: "Size",
  origin: "Origin",
};

/**
 * `buildFacetGroups` drops options whose scoped count is zero — including
 * whole groups. An applied selection that lands there would stay active in
 * the URL yet vanish from the drawer and the toolbar chips, so the shopper
 * could see it neither to read nor to remove it. Re-add every applied value
 * as a marked option (labelled from the taxonomy, count honestly 0).
 */
const keepAppliedVisible = (
  groups: FilterGroup[],
  state: CatalogState,
  optionLabels: FacetLabels,
  locale?: string,
): FilterGroup[] => {
  const merged = groups.map((group) => ({
    ...group,
    options: [...group.options],
  }));

  for (const key of Object.keys(GROUP_FALLBACK_LABELS) as FilterKey[]) {
    const appliedValues = state[key];
    if (appliedValues.length === 0) continue;

    let group = merged.find((candidate) => candidate.key === key);
    let added = false;
    for (const value of appliedValues) {
      if (group?.options.some((option) => option.value === value)) continue;
      const option = {
        value,
        label:
          optionLabels[key]?.[value] ?? facetOptionLabel(key, value, locale),
        count: 0,
      };
      if (group) {
        group.options.push(option);
      } else {
        group = { key, label: GROUP_FALLBACK_LABELS[key], options: [option] };
        merged.push(group);
      }
      added = true;
    }

    if (added && group) {
      group.options.sort((a, b) =>
        key === "size"
          ? compareSizes(a.value, b.value)
          : a.label.localeCompare(b.label, "vi"),
      );
    }
  }

  return merged;
};

export const buildListing = async (
  regionId: string,
  search: string,
  options: CatalogOptions = {},
): Promise<CatalogListing> => {
  const { state } = normalizeSearch(search, PASSTHROUGH_RESOLVERS);
  const all = await listProducts(regionId);

  const selected = sortCatalog(filterCatalog(all, state, options), state.sort);
  const { items, count, page, pageCount, beyond } = paginateCatalog(
    selected,
    state.page,
  );

  // Taxonomy-wide labels: a chip's selection may be outside this page's
  // scoped option list (dropped for a zero count under other filters), and
  // facetOptionLabel alone would render its raw handle.
  const taxonomy = await getTaxonomy();
  const optionLabels: FacetLabels = {
    category: Object.fromEntries(
      [...taxonomy.categoryByHandle].map(([handle, node]) => [
        handle,
        node.name,
      ]),
    ),
    collection: Object.fromEntries(
      [...taxonomy.collectionByHandle].map(([handle, node]) => [
        handle,
        node.title,
      ]),
    ),
  };

  const groups = keepAppliedVisible(
    buildFacetGroups(all, state, options),
    state,
    optionLabels,
    options.locale,
  );

  return {
    state,
    products: items,
    suggestions: pickSuggestions(all, selected, options),
    groups,
    optionLabels,
    totalCount: count,
    page,
    pageCount,
    priceBounds: priceBoundsOf(all),
    beyond,
  };
};

export type CategoryPageData = {
  node: CategoryNode;
  parent: CategoryNode | null;
  basePath: string;
  listing: CatalogListing;
};

/**
 * Resolves a category route and its listing.
 *
 * `parentHandle` is supplied by the two-level route: a child URL may only name
 * its real parent, otherwise there is no such path (returns null → 404).
 */
export const buildCategoryPage = async (
  regionId: string,
  search: string,
  taxonomy: Taxonomy,
  categoryHandle: string,
  parentHandle?: string,
  locale?: string,
): Promise<CategoryPageData | null> => {
  const node = taxonomy.categoryByHandle.get(categoryHandle);
  if (!node) return null;
  if (parentHandle !== undefined && node.parentHandle !== parentHandle) {
    return null;
  }

  const parent = node.parentHandle
    ? (taxonomy.categoryByHandle.get(node.parentHandle) ?? null)
    : null;

  const listing = await buildListing(regionId, search, {
    pathCategories: categoryPathHandles(taxonomy, node.handle),
    primaryCategory: node.handle,
    locale,
  });

  return {
    node,
    parent,
    basePath: parent ? `/${parent.handle}/${node.handle}` : `/${node.handle}`,
    listing,
  };
};
