import type { APIRoute } from "astro";
import { listPromotions } from "@lib/data/promotions";
import { getTaxonomy } from "@lib/data/taxonomy";
import { sdk } from "@lib/sdk";
import { buildSitemapXml, type SitemapEntry } from "@lib/utils/seo";

/**
 * `/sitemap.xml` — the canonical, unfiltered pages only: static routes, flat
 * categories (parent + child paths), collections that carry products,
 * published products and live promotions. Filtered variants, app routes and
 * 404s never appear: a crawler is only offered addresses that answer 200.
 *
 * A Medusa failure answers 503 + Retry-After rather than an incomplete
 * sitemap — a partial one would silently drop pages from the index.
 */

const STATIC_PATHS = ["/", "/store", "/privacy", "/terms", "/khuyen-mai"];
const PAGE_SIZE = 100; // the store API's maximum page size

export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL("https://demostore.ceonogy.com")).origin;

  try {
    const [taxonomy, promotions] = await Promise.all([
      getTaxonomy(),
      listPromotions(),
    ]);

    const products: { handle: string; updated_at?: string | null }[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { products: page } = await sdk.store.product.list({
        fields: "handle,updated_at",
        limit: PAGE_SIZE,
        offset,
      });
      products.push(...(page ?? []));
      if (!page?.length || page.length < PAGE_SIZE) break;
    }

    const entries: SitemapEntry[] = STATIC_PATHS.map((path) => ({
      loc: `${origin}${path}`,
    }));

    for (const node of taxonomy.categoryByHandle.values()) {
      entries.push({
        loc: node.parentHandle
          ? `${origin}/${node.parentHandle}/${node.handle}`
          : `${origin}/${node.handle}`,
      });
    }

    for (const collection of taxonomy.collectionByHandle.values()) {
      // Collections without products are hidden pages by design (Part 1).
      if (!taxonomy.collectionIdsWithProducts.has(collection.id)) continue;
      entries.push({ loc: `${origin}/bo-suu-tap/${collection.handle}` });
    }

    for (const product of products) {
      if (!product.handle) continue;
      entries.push({
        loc: `${origin}/store/${product.handle}`,
        ...(product.updated_at
          ? { lastmod: new Date(product.updated_at).toISOString().slice(0, 10) }
          : {}),
      });
    }

    for (const promotion of promotions) {
      entries.push({ loc: `${origin}/khuyen-mai/${promotion.slug}` });
    }

    return new Response(buildSitemapXml(entries), {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control":
          "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("sitemap build failed", error);
    return new Response("Service Unavailable", {
      status: 503,
      headers: {
        "Retry-After": "30",
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
};
