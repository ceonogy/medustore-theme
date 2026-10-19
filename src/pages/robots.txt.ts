import type { APIRoute } from "astro";

/**
 * `/robots.txt` as a route rather than a `public/` file: the adapter serves
 * public files before the app (and therefore before the middleware) ever
 * sees the request, which would leave this without an edge TTL. The crawl
 * policy itself is static; the sitemap line follows the canonical host.
 */
export const GET: APIRoute = async ({ site }) => {
  const origin = (site ?? new URL("https://demostore.ceonogy.com")).origin;

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /order",
    // Faceted /store query strings are duplicate-content crawl traps:
    // they multiply combinatorially (category × collection × size × sort)
    // and each one costs a full SSR render. The indexable entry points are
    // the clean /store, collection and product URLs — all still allowed.
    "Disallow: /store?",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
};
