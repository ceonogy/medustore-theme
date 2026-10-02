import type { HttpTypes } from "@medusajs/types";
import type { FilterGroup } from "../../types/global";
import {
  normalizeSearch,
  emptyCatalogState,
  type CatalogState,
} from "../utils/canonical-query";
import {
  buildFacetGroups,
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

export const buildListing = async (
  regionId: string,
  search: string,
  options: CatalogOptions = {},
): Promise<CatalogListing> => {
  const { state } = normalizeSearch(search, PASSTHROUGH_RESOLVERS);
  const all = await listProducts(regionId);

  const selected = sortCatalog(filterCatalog(all, state, options), state.sort);
  const groups = buildFacetGroups(all, state, options);
  const { items, count, page, pageCount, beyond } = paginateCatalog(
    selected,
    state.page,
  );

  return {
    state,
    products: items,
    suggestions: pickSuggestions(all, selected, options),
    groups,
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
  });

  return {
    node,
    parent,
    basePath: parent ? `/${parent.handle}/${node.handle}` : `/${node.handle}`,
    listing,
  };
};
