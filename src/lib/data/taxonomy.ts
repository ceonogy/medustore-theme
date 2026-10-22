import fs from "node:fs";
import path from "node:path";
import { sdk } from "@lib/sdk";
import { originOf, sizeValuesOf } from "@lib/utils/catalog";
import type { ProductVariant } from "../../types/global";

/**
 * Server-side snapshot of the catalogue taxonomy: handle ↔ id maps for
 * categories, collections and products, a persisted history of handles
 * that were renamed so old URLs can 301 to their replacement, and the
 * vocabulary the filter URL accepts (every size and origin the shop carries).
 *
 * Everything is cached for a minute — middleware runs on every page request
 * and must not turn into an N+1 against Medusa. The history file lives in
 * `.cache/` (gitignored) keyed by the stable Medusa id, so a rename is
 * detected by diffing two snapshots instead of needing a backend hook.
 */

const TTL_MS = 60_000;
const PAGE_SIZE = 100;
const HISTORY_FILE = path.join(process.cwd(), ".cache", "handle-history.json");

export type CategoryNode = {
  id: string;
  handle: string;
  name: string;
  description: string;
  parentCategoryId: string | null;
  parentHandle: string | null;
  childHandles: string[];
};

export type CollectionNode = {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  image: string | null;
};

/** A featured product for the mega menu — only handle/title/image matter. */
export type FeaturedProduct = {
  handle: string;
  title: string;
  thumbnail: string;
};

export type Taxonomy = {
  categoryByHandle: Map<string, CategoryNode>;
  categoryHandleById: Map<string, string>;
  collectionByHandle: Map<string, CollectionNode>;
  collectionHandleById: Map<string, string>;
  /** Collections that currently carry at least one product. */
  collectionIdsWithProducts: Set<string>;
  /** First product thumbnail per collection — the mega-menu card image when
   *  the collection itself carries no `metadata.image`. */
  collectionThumbnails: Map<string, string>;
  /** Products flagged `metadata.featured` in the Medusa admin (newest first,
   *  capped at 5) — the "Nổi bật" row of the header mega menu. */
  featuredProducts: FeaturedProduct[];
  productHandleById: Map<string, string>;
  /** Every size the catalogue offers (lowercase — the canonical URL form). */
  sizeValues: Set<string>;
  /** Every ISO-2 origin the catalogue offers (lowercase). */
  originValues: Set<string>;
  /** renamed handle -> current handle, per entity kind. */
  legacy: {
    category: Map<string, string>;
    collection: Map<string, string>;
    product: Map<string, string>;
  };
};

type EntityKind = "category" | "collection" | "product";

type HistoryFile = {
  snapshot: Record<EntityKind, Record<string, string>>;
  legacy: Record<EntityKind, Record<string, string>>;
};

const emptyHistoryFile = (): HistoryFile => ({
  snapshot: { category: {}, collection: {}, product: {} },
  legacy: { category: {}, collection: {}, product: {} },
});

const readHistoryFile = (): HistoryFile => {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<HistoryFile>;
    return {
      snapshot: { ...emptyHistoryFile().snapshot, ...parsed.snapshot },
      legacy: { ...emptyHistoryFile().legacy, ...parsed.legacy },
    };
  } catch {
    // First run (or unreadable file): start from an empty history.
    return emptyHistoryFile();
  }
};

const writeHistoryFile = (history: HistoryFile) => {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`);
  } catch (error) {
    console.warn("taxonomy: could not persist handle history", error);
  }
};

/**
 * Diffs the previous snapshot against the current one: any id whose handle
 * moved contributes `old -> new`, and a handle that is live again drops its
 * stale entry (so we never redirect away from a canonical URL).
 */
const updateHistory = (
  history: HistoryFile,
  kind: EntityKind,
  current: Map<string, string>, // id -> handle
): boolean => {
  const snapshot = history.snapshot[kind];
  const legacy = history.legacy[kind];
  const live = new Set(current.values());
  let changed = false;

  for (const [id, handle] of current) {
    const previous = snapshot[id];
    if (!previous) {
      // A brand-new entity must dirty the history too: without persisting it
      // now, a rename that happens before any other change would find no
      // "previous" handle in the file and the old URL would 404 instead of
      // 301-ing to the replacement.
      changed = true;
    } else if (previous !== handle) {
      legacy[previous] = handle;
      changed = true;
    }
    snapshot[id] = handle;
  }

  for (const id of Object.keys(snapshot)) {
    if (!current.has(id)) {
      delete snapshot[id];
      changed = true;
    }
  }

  for (const [oldHandle, newHandle] of Object.entries(legacy)) {
    if (!live.has(newHandle) || live.has(oldHandle)) {
      delete legacy[oldHandle];
      changed = true;
    }
  }

  return changed;
};

const toLegacyMap = (history: HistoryFile, kind: EntityKind) =>
  new Map(Object.entries(history.legacy[kind]));

type CategoryRow = {
  id: string;
  handle: string;
  name: string;
  description?: string | null;
  parent_category_id?: string | null;
};

type CollectionRow = {
  id: string;
  handle: string;
  title: string;
  metadata?: Record<string, unknown> | null;
};

/** A product projection light enough to page through for taxonomy purposes. */
type LightProduct = {
  id: string;
  handle: string;
  title: string;
  collection_id: string | null;
  thumbnail?: string | null;
  origin_country?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  options?: { id: string; title?: string | null }[] | null;
  variants?: ProductVariant[] | null;
};

/** Pages through the light product projection used for handle history — it
 *  also carries the attributes that make up the filter vocabulary. */
const listLightProducts = async (): Promise<LightProduct[]> => {
  const all: LightProduct[] = [];
  let offset = 0;

  for (;;) {
    const { products, count } = await sdk.store.product.list({
      fields:
        "id,handle,title,collection_id,thumbnail,*collection,origin_country,created_at,+metadata,*options,*variants.options",
      limit: PAGE_SIZE,
      offset,
    });
    all.push(
      ...(products ?? []).map(
        (product: {
          id: string;
          handle?: string | null;
          title?: string | null;
          collection_id?: string | null;
          thumbnail?: string | null;
          origin_country?: string | null;
          created_at?: string | null;
          metadata?: Record<string, unknown> | null;
          options?: { id: string; title?: string | null }[] | null;
          variants?: ProductVariant[] | null;
        }) => ({
          id: product.id,
          handle: product.handle ?? "",
          title: product.title ?? "",
          collection_id:
            product.collection_id ??
            (product as { collection?: { id?: string } | null }).collection
              ?.id ??
            null,
          thumbnail: product.thumbnail ?? null,
          origin_country: product.origin_country ?? null,
          created_at: product.created_at ?? null,
          metadata: product.metadata ?? null,
          options: product.options ?? null,
          variants: product.variants ?? null,
        }),
      ),
    );
    offset += PAGE_SIZE;
    if (!count || offset >= count || !products?.length) break;
  }

  return all;
};

const loadTaxonomy = async (): Promise<Taxonomy> => {
  const [categoryResult, collectionResult, lightProducts] = await Promise.all([
    sdk.store.category.list({ limit: PAGE_SIZE }),
    sdk.store.collection.list({ limit: PAGE_SIZE }),
    listLightProducts(),
  ]);

  const categoryRows = (categoryResult.product_categories ??
    []) as CategoryRow[];
  const collectionRows = (collectionResult.collections ??
    []) as CollectionRow[];

  const categoryByHandle = new Map<string, CategoryNode>();
  const categoryHandleById = new Map<string, string>();
  const categoryById = new Map<string, CategoryRow>();

  categoryRows.forEach((row) => {
    categoryById.set(row.id, row);
    categoryHandleById.set(row.id, row.handle);
  });

  categoryRows.forEach((row) => {
    const parent = row.parent_category_id
      ? categoryById.get(row.parent_category_id)
      : undefined;
    categoryByHandle.set(row.handle, {
      id: row.id,
      handle: row.handle,
      name: row.name,
      description: row.description ?? "",
      parentCategoryId: row.parent_category_id ?? null,
      parentHandle: parent?.handle ?? null,
      childHandles: [],
    });
  });

  // Children after every handle is known, so parent nodes can link forwards.
  categoryRows.forEach((row) => {
    const parent = row.parent_category_id
      ? categoryById.get(row.parent_category_id)
      : undefined;
    if (parent) {
      const parentNode = categoryByHandle.get(parent.handle);
      if (parentNode) parentNode.childHandles.push(row.handle);
    }
  });

  const collectionByHandle = new Map<string, CollectionNode>();
  const collectionHandleById = new Map<string, string>();
  collectionRows.forEach((row) => {
    const metadata = (row.metadata ?? {}) as {
      description?: unknown;
      image?: unknown;
    };
    collectionByHandle.set(row.handle, {
      id: row.id,
      handle: row.handle,
      title: row.title,
      description:
        typeof metadata.description === "string" ? metadata.description : null,
      image: typeof metadata.image === "string" ? metadata.image : null,
    });
    collectionHandleById.set(row.id, row.handle);
  });

  const productHandleById = new Map<string, string>();
  const collectionIdsWithProducts = new Set<string>();
  const collectionThumbnails = new Map<string, string>();
  const sizeValues = new Set<string>();
  const originValues = new Set<string>();
  lightProducts.forEach((product) => {
    if (product.handle) productHandleById.set(product.id, product.handle);
    if (product.collection_id) {
      collectionIdsWithProducts.add(product.collection_id);
      // First product in listing order wins — same rule the homepage uses
      // when a collection has no image of its own.
      if (product.thumbnail && !collectionThumbnails.has(product.collection_id))
        collectionThumbnails.set(product.collection_id, product.thumbnail);
    }
    // The filter vocabulary — every size/origin a `?size=`/`?origin=` value
    // may name, harvested during the pass that already reads all products.
    sizeValuesOf(product).forEach((value) => sizeValues.add(value));
    const origin = originOf(product);
    if (origin) originValues.add(origin);
  });

  const history = readHistoryFile();
  let historyChanged = false;
  historyChanged = updateHistory(history, "category", categoryHandleById);
  historyChanged =
    updateHistory(history, "collection", collectionHandleById) ||
    historyChanged;
  historyChanged =
    updateHistory(history, "product", productHandleById) || historyChanged;
  if (historyChanged) writeHistoryFile(history);

  // "Nổi bật": products flagged metadata.featured in the Medusa admin product
  // page. Newest first, capped at 5, only cards with a photo (the mega-menu
  // tile needs an image; admin can fix a blank one by setting the thumbnail).
  const featuredProducts = lightProducts
    .filter((product) => {
      const featured = product.metadata?.featured;
      return (
        !!product.handle &&
        !!product.thumbnail &&
        (featured === true || featured === "true" || featured === 1)
      );
    })
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 5)
    .map((product) => ({
      handle: product.handle,
      title: product.title || product.handle,
      thumbnail: product.thumbnail as string,
    }));

  return {
    categoryByHandle,
    categoryHandleById,
    collectionByHandle,
    collectionHandleById,
    collectionIdsWithProducts,
    collectionThumbnails,
    featuredProducts,
    productHandleById,
    sizeValues,
    originValues,
    legacy: {
      category: toLegacyMap(history, "category"),
      collection: toLegacyMap(history, "collection"),
      product: toLegacyMap(history, "product"),
    },
  };
};

let cache: { value: Taxonomy; loadedAt: number } | null = null;
let inflight: Promise<Taxonomy> | null = null;

export const getTaxonomy = async (): Promise<Taxonomy> => {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.value;

  // One flight per process so a burst of requests does not stampede Medusa.
  if (!inflight) {
    inflight = loadTaxonomy()
      .then((value) => {
        cache = { value, loadedAt: Date.now() };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
};

/** Handle of a category (or one of its descendants) that is still live. */
export const resolveCategoryHandle = (
  taxonomy: Taxonomy,
  value: string,
): string | null => {
  if (taxonomy.categoryByHandle.has(value)) return value;
  if (taxonomy.categoryHandleById.has(value)) {
    return taxonomy.categoryHandleById.get(value) ?? null;
  }
  return null;
};

export const resolveCollectionHandle = (
  taxonomy: Taxonomy,
  value: string,
): string | null => {
  if (taxonomy.collectionByHandle.has(value)) return value;
  if (taxonomy.collectionHandleById.has(value)) {
    return taxonomy.collectionHandleById.get(value) ?? null;
  }
  return null;
};

/**
 * Size/origin values the catalogue carries. The sets are lowercase, and
 * `throughTaxonomy` in front of these resolvers gives a hand-typed `?size=XL`
 * one retry in lower case — so the canonical URL is always the lowercase form.
 */
export const resolveSizeValue = (
  taxonomy: Taxonomy,
  value: string,
): string | null => (taxonomy.sizeValues.has(value) ? value : null);

export const resolveOriginValue = (
  taxonomy: Taxonomy,
  value: string,
): string | null => (taxonomy.originValues.has(value) ? value : null);

/** The path handle plus every descendant handle — what a category URL covers. */
export const categoryPathHandles = (
  taxonomy: Taxonomy,
  handle: string,
): string[] => {
  const covered: string[] = [];
  const seen = new Set<string>();

  const walk = (current: string) => {
    if (seen.has(current)) return;
    seen.add(current);
    covered.push(current);
    taxonomy.categoryByHandle.get(current)?.childHandles.forEach(walk);
  };

  walk(handle);
  return covered;
};
