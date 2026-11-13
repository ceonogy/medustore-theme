import type { APIContext } from "astro";
import { buildCategoryPage, buildListing } from "@lib/data/catalog";
import { findPromotion } from "@lib/data/promotions";
import { getRegion } from "@lib/data/regions";
import { getTaxonomy } from "@lib/data/taxonomy";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  // The market comes from a per-visitor cookie and the catalogue changes
  // with admin edits — this answer is never shareable, never storable.
  "Cache-Control": "private, no-store",
} as const;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });

/**
 * Result count for a filter state — the drawer's "Hiển thị N sản phẩm"
 * while the shopper is still selecting.
 *
 * The drawer sends the canonical path it sits on plus the draft query
 * (`/api/filter-count?path=/giay-dep&size=38`). This matters: the listing
 * routes scope their results by the URL *path* (flat category, collection,
 * promotion), not the query string — counting the query alone would count
 * the whole catalogue. The scope below deliberately mirrors the four
 * listing routes in src/pages (store, flat categories, bo-suu-tap,
 * khuyen-mai), each going through the same buildListing the page renders
 * with, so the number can never drift from the applied page.
 */
export const GET = async (context: APIContext): Promise<Response> => {
  try {
    const region = await getRegion(context.locals.countryCode);
    if (!region) {
      return json({ error: "no region" }, 400);
    }

    // `path` is metadata about which route the count belongs to, not a
    // filter — strip it before handing the query to the listing logic.
    const params = new URLSearchParams(context.url.search);
    const path = params.get("path") ?? "/store";
    params.delete("path");
    const search = params.toString() ? `?${params.toString()}` : "";

    const segments = path.split("/").filter(Boolean);
    const root = segments[0] ?? "store";

    // Mirror of the listing routes' own scoping (see the .astro pages):
    // - /store → the whole catalogue
    // - /bo-suu-tap/{handle} → the collection the path names
    // - /khuyen-mai/{slug} → the promotion's product set
    // - anything else → flat category path (parent/child or single).
    if (root === "bo-suu-tap") {
      const listing = await buildListing(region.id, search, {
        pathCollection: segments[1] ?? "",
      });
      return json({ count: listing.totalCount });
    }

    if (root === "khuyen-mai") {
      const slug = segments[1];
      const promotion = slug ? await findPromotion(slug) : null;
      if (!promotion) return json({ error: "unknown promotion" }, 404);
      const listing = await buildListing(region.id, search, {
        pathProducts: new Set(promotion.product_ids),
      });
      return json({ count: listing.totalCount });
    }

    if (root !== "store") {
      const taxonomy = await getTaxonomy();
      const listing = await buildCategoryPage(
        region.id,
        search,
        taxonomy,
        segments[segments.length - 1] ?? "",
        segments.length > 1 ? segments[segments.length - 2] : undefined,
      );
      // The drawer only ever counts paths it is rendered on; anything else
      // is a stale or fabricated request — 404, never a misleading zero.
      if (!listing) return json({ error: "unknown path" }, 404);
      return json({ count: listing.listing.totalCount });
    }

    const listing = await buildListing(region.id, search, {});
    return json({ count: listing.totalCount });
  } catch (error) {
    // A backend outage is a retryable failure, never a count of zero —
    // zero would read as "no products match" and mislead the shopper.
    console.error("filter-count failed", error);
    return new Response(JSON.stringify({ error: "service unavailable" }), {
      status: 503,
      headers: { ...RESPONSE_HEADERS, "Retry-After": "10" },
    });
  }
};
