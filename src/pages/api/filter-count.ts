import type { APIContext } from "astro";
import { buildListing } from "@lib/data/catalog";
import { getRegion } from "@lib/data/regions";

const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  // The market comes from a per-visitor cookie and the catalogue changes
  // with admin edits — this answer is never shareable, never storable.
  "Cache-Control": "private, no-store",
} as const;

/**
 * Result count for a filter state — the drawer's "Hiển thị N sản phẩm".
 *
 * Deliberately thin: it runs `buildListing`, the exact logic the listing
 * pages themselves use, so the number shown before applying can never drift
 * from what the applied page would report. The query string is passed
 * through unchanged; the middleware already canonicalises it.
 */
export const GET = async (context: APIContext): Promise<Response> => {
  try {
    const region = await getRegion(context.locals.countryCode);
    if (!region) {
      return new Response(JSON.stringify({ error: "no region" }), {
        status: 400,
        headers: RESPONSE_HEADERS,
      });
    }

    const listing = await buildListing(region.id, context.url.search, {});
    return new Response(JSON.stringify({ count: listing.totalCount }), {
      status: 200,
      headers: RESPONSE_HEADERS,
    });
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
