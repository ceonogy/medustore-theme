import type { HttpTypes } from "@medusajs/types";
import { defineMiddleware } from "astro:middleware";
import type { APIContext, MiddlewareNext } from "astro";
import {
  DEFAULT_LOCALE,
  I18N_ENABLED,
  isLocale,
  type Locale,
} from "./i18n/config";
import { sdk } from "./lib/sdk";
import {
  getTaxonomy,
  resolveCategoryHandle,
  resolveCollectionHandle,
  resolveOriginValue,
  resolveSizeValue,
  type Taxonomy,
} from "./lib/data/taxonomy";
import {
  ACTIVE_FILTER_PARAMS,
  normalizeSearch,
  resolveCanonical,
  type PageType,
} from "./lib/utils/canonical-query";

const MEDUSA_BACKEND_URL = import.meta.env.PUBLIC_MEDUSA_BACKEND_URL;
const DEFAULT_REGION = import.meta.env.DEFAULT_REGION;

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
};

function isStaticOrInternalPath(pathname: string) {
  // Astro/Vite internal and image optimization routes
  if (
    pathname === "/_astro" ||
    pathname.startsWith("/_astro/") ||
    pathname === "/_image" ||
    pathname.startsWith("/_image") ||
    pathname.startsWith("/@") || // e.g. /@vite, /@id, /@fs (dev)
    pathname.startsWith("/__") // e.g. /__vite_ping (dev)
  ) {
    return true;
  }

  // Common site root static files
  if (
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest"
  ) {
    return true;
  }

  // Any file with an extension (images, css, js, fonts, etc.)
  const lastSegment = pathname.split("/").pop() ?? "";
  return lastSegment.includes(".") && lastSegment !== ".well-known";
}

/**
 * Fetches regions from Medusa and caches them in a map.
 * @returns A map of country codes to regions.
 */
async function getRegionMap() {
  const { regionMap, regionMapUpdated } = regionMapCache;

  if (!MEDUSA_BACKEND_URL) {
    throw new Error(
      "src/middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a PUBLIC_MEDUSA_BACKEND_URL environment variable?",
    );
  }

  const isCacheValid =
    regionMap.keys().next().value &&
    regionMapUpdated > Date.now() - 3600 * 1000; // 1 hour

  if (!isCacheValid) {
    try {
      const { regions } = await sdk.store.region.list();

      if (!regions?.length) {
        throw new Error(
          "No regions found. Please set up regions in your Medusa Admin.",
        );
      }

      regions.forEach((region: HttpTypes.StoreRegion) => {
        region.countries?.forEach((country) => {
          const iso2 = (country.iso_2 ?? "").toLowerCase();
          if (iso2) {
            regionMapCache.regionMap.set(iso2, region);
          }
        });
      });

      regionMapCache.regionMapUpdated = Date.now();
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch regions from Medusa.");
    }
  }

  return regionMapCache.regionMap;
}

/**
 * Resolves the market (country) used for region/currency resolution.
 *
 * The country no longer lives in the URL — Vietnamese is served from the root
 * and other locales are prefixed — so the market comes from the `country`
 * cookie when present, otherwise from `DEFAULT_REGION`, otherwise from the
 * first country of the first region.
 */
async function resolveMarketCountry(
  cookieCountry?: string,
): Promise<string | undefined> {
  const regionMap = await getRegionMap();
  const wanted = cookieCountry?.toLowerCase();

  if (wanted && regionMap.has(wanted)) {
    return wanted;
  }
  if (DEFAULT_REGION && regionMap.has(DEFAULT_REGION.toLowerCase())) {
    return DEFAULT_REGION.toLowerCase();
  }
  return regionMap.keys().next().value;
}

/** Flat `/{handle}` paths may only ever resolve to a category. */
type FlatResolution =
  | { kind: "continue" }
  | { kind: "redirect"; path: string; search?: string }
  | { kind: "not-found" };

const notFound = () =>
  new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

const serviceUnavailable = () =>
  new Response("Service Unavailable", {
    status: 503,
    headers: {
      "Retry-After": "30",
      "Cache-Control": "private, no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

/**
 * Validates a flat path against the category tree: a live handle continues,
 * a renamed handle redirects to its current URL, anything else 404s. Category
 * depth stops at two levels.
 */
const resolveFlatPath = (
  segments: string[],
  taxonomy: Taxonomy,
): FlatResolution => {
  if (segments.length === 0 || segments.length > 2) {
    return { kind: "not-found" };
  }

  const [first, second] = segments;
  const parentHandle = resolveCategoryHandle(taxonomy, first);

  if (!parentHandle) {
    const legacy = taxonomy.legacy.category.get(first);
    if (legacy) return { kind: "redirect", path: `/${legacy}` };
    return { kind: "not-found" };
  }

  if (segments.length === 1) return { kind: "continue" };

  const parent = taxonomy.categoryByHandle.get(parentHandle);
  if (parent?.childHandles.includes(second)) return { kind: "continue" };

  const legacyParent = taxonomy.legacy.category.get(first);
  if (legacyParent) {
    return { kind: "redirect", path: `/${legacyParent}/${second}` };
  }
  return { kind: "not-found" };
};

/** Which kind of filterable page a path is, if any. */
const detectPageType = (segments: string[]): PageType | null => {
  if (segments.length === 1 && segments[0] === "store") return "store";
  if (segments.length === 2 && segments[0] === "bo-suu-tap") {
    return "collection";
  }
  if (segments[0] === "khuyen-mai") return "promotion";
  return null;
};

/**
 * Rewrites a request's query into its canonical form, or returns null when
 * the URL is already canonical. Never 404s: an unknown filter value simply
 * disappears from the URL, the page itself stays valid.
 */
const normalizeCatalogQuery = (
  path: string,
  search: string,
  pageType: PageType,
  taxonomy: Taxonomy,
): { path: string; search: string } | null => {
  const { state, tracking, passthrough } = normalizeSearch(search, {
    resolveCategory: (value) => resolveCategoryHandle(taxonomy, value),
    resolveCollection: (value) => resolveCollectionHandle(taxonomy, value),
    // Sizes and origins validate against the catalogue vocabulary (also
    // harvested by the taxonomy call above), so an unknown value leaves the
    // URL in one 301 rather than rendering a page that never filtered.
    resolveSize: (value) => resolveSizeValue(taxonomy, value),
    resolveOrigin: (value) => resolveOriginValue(taxonomy, value),
    supported: ACTIVE_FILTER_PARAMS,
  });

  let effectivePageType: PageType = pageType;
  // The path can move twice: a drill-down (parent -> child page) or a move to
  // /store when the request combines the path selection with other filters.
  let targetPath = path;

  if (pageType === "category") {
    // The path already selects a category (a parent page also covers its
    // children), so an equal `category` param is redundant. A single child
    // handle means the visitor drilled down a level and canonicalises to
    // `/{parent}/{child}`; anything else moves to the multi-category form.
    const categorySegments = path.split("/").filter(Boolean);
    const primary = categorySegments[categorySegments.length - 1];
    const node = taxonomy.categoryByHandle.get(primary);
    const childHandles = new Set(node?.childHandles ?? []);

    const wanted = state.category.filter((handle) => handle !== primary);
    state.category = [];

    if (
      wanted.length === 1 &&
      categorySegments.length === 1 &&
      childHandles.has(wanted[0])
    ) {
      targetPath = `/${primary}/${wanted[0]}`;
    } else if (wanted.length) {
      state.category = [...new Set([primary, ...wanted])].sort((a, b) =>
        a.localeCompare(b),
      );
      effectivePageType = "store";
      targetPath = "/store";
    }
  } else if (pageType === "collection") {
    const pathHandle = path.split("/").filter(Boolean)[1];
    const remaining = state.collection.filter(
      (handle) => handle !== pathHandle,
    );
    state.collection = [];
    if (remaining.length) {
      state.collection = [...new Set([pathHandle, ...remaining])].sort((a, b) =>
        a.localeCompare(b),
      );
      effectivePageType = "store";
      targetPath = "/store";
    }
  }

  const target = resolveCanonical({
    pageType: effectivePageType,
    path: targetPath,
    state,
    tracking,
    passthrough,
  });

  // Compared as raw strings: the target is the canonical form of exactly these
  // values, so ids/slugs, ordering, `page=1` and encoding all normalise in one
  // hop — while re-parsing with URLSearchParams here would percent-encode the
  // comma the target just emitted and send canonical URLs in circles.
  const currentSearch = search.startsWith("?") ? search.slice(1) : search;
  const targetSearch = target.search.replace(/^\?/, "");
  if (target.path !== path || targetSearch !== currentSearch) return target;
  return null;
};

/** Top-level routes whose rendered HTML is per-visitor, never shareable. */
const PER_VISITOR_ROOTS = new Set(["cart", "checkout", "order"]);

// Same-origin proxy for the Medusa store API: `/medusa/store/...` →
// backend `/store/...`. The browser-side SDK points here so every
// cart/checkout call is same-origin and CORS never enters the picture —
// it cannot: Medusa's publishable-key guard answers preflight OPTIONS
// with 400 before any CORS middleware runs (drilled against the live
// backend). SSR keeps talking to the backend URL directly.
const MEDUSA_PROXY_PREFIX = "/medusa";

// Forwarded verbatim so backend rate limiting (password reset) can key
// on the real client IP — OLS appends it; the backend trusts the
// rightmost entry only.
const PROXY_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "authorization",
  "idempotency-key",
  "x-publishable-api-key",
  "x-forwarded-for",
];

const proxyToBackend = async (context: APIContext): Promise<Response> => {
  if (!MEDUSA_BACKEND_URL) {
    return new Response(JSON.stringify({ message: "backend not configured" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }

  const target =
    MEDUSA_BACKEND_URL +
    context.url.pathname.slice(MEDUSA_PROXY_PREFIX.length) +
    context.url.search;

  const headers = new Headers();
  for (const name of PROXY_REQUEST_HEADERS) {
    const value = context.request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = context.request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const upstream = await fetch(target, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    // Node's fetch requires this to stream a request body through.
    ...(hasBody
      ? ({ duplex: "half" } as RequestInit & { duplex: string })
      : {}),
    redirect: "manual",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      // Cart, payment and order traffic — never cacheable anywhere.
      "cache-control": "private, no-store",
    },
  });
};

const handle = async (
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> => {
  // Never redirect non-page requests (assets, dev internals, etc.)
  if (isStaticOrInternalPath(context.url.pathname)) {
    const response = await next();
    // Edge caching for what lives here: content-hashed bundles, the
    // parameterised image renditions, and root files (robots, favicon).
    // Only successful answers are stored; the sitemap endpoint keeps the
    // policy it set for itself, everything else gets the root-file default
    // (Astro's bare `public, max-age=0` on public/ files earns no edge hit).
    if (response.status < 400 && context.url.pathname !== "/sitemap.xml") {
      const path = context.url.pathname;
      if (path.startsWith("/_astro/")) {
        if (!response.headers.has("Cache-Control")) {
          response.headers.set(
            "Cache-Control",
            "public, max-age=31536000, immutable",
          );
        }
      } else if (path.startsWith("/_image")) {
        if (!response.headers.has("Cache-Control")) {
          response.headers.set("Cache-Control", "public, max-age=604800");
        }
      } else {
        response.headers.set(
          "Cache-Control",
          "public, max-age=0, s-maxage=3600",
        );
      }
    }
    return response;
  }

  // Medusa store API proxy — must run before the method gate below,
  // because cart/payment traffic arrives as POST.
  if (
    context.url.pathname === MEDUSA_PROXY_PREFIX ||
    context.url.pathname.startsWith(`${MEDUSA_PROXY_PREFIX}/`)
  ) {
    return proxyToBackend(context);
  }

  // Only redirect navigations; avoid changing semantics for form submits, etc.
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return next();
  }

  const pathname = context.url.pathname;
  const search = context.url.search;
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();

  // Top-level page segments defined by `src/pages/[...locale]/`. Anything else
  // as a first segment (e.g. `/typo`) is not a route and must 404 rather than
  // fall through to the catch-all landing page — unless it is a category
  // handle, which resolves to its own flat URL (see the branch below).
  const ROUTE_ROOTS = new Set([
    "store",
    "cart",
    "checkout",
    "privacy",
    "terms",
    "order",
    // Reserved for their own routes: they must never resolve as categories.
    "bo-suu-tap",
    "khuyen-mai",
    "tim-kiem",
    "tai-khoan",
    // JSON helpers (filter-count) — not pages, never categories.
    "api",
  ]);

  // Segments after any locale prefix — the path the router actually matches.
  let appSegments = segments;

  // Behind OpenLiteSpeed the app only sees plain HTTP, so honor the proxy
  // headers to keep redirects on https:// instead of downgrading them.
  const forwardedProto = context.request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim()
    .toLowerCase();
  const scheme =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : context.url.protocol.replace(":", "");
  const origin = `${scheme}://${context.url.host}`;

  const redirectTo = (
    path: string,
    status: 301 | 308 | 307 = 301,
    searchOverride?: string,
  ) => context.redirect(`${origin}${path}${searchOverride ?? search}`, status);

  // No trailing slashes outside the homepage, and slugs stay lowercase:
  // both are plain 301s, so `/store/` and `/Giay-Dep` never compete with the
  // canonical form of the page. Medusa ids are the exception — lowercasing a
  // `prod_…` or `order_…` reference turns it into an id the API cannot find,
  // so those paths are left exactly as published.
  if (pathname.length > 1 && /\/$/.test(pathname)) {
    return redirectTo(pathname.replace(/\/+$/, ""));
  }
  if (
    pathname !== pathname.toLowerCase() &&
    !/\/(?:prod|order)_[A-Za-z0-9]/i.test(pathname)
  ) {
    return redirectTo(pathname.toLowerCase());
  }

  let locale: Locale = DEFAULT_LOCALE;

  if (firstSegment && isLocale(firstSegment)) {
    const rest = segments.slice(1);
    const target = rest.length ? `/${rest.join("/")}` : "/";

    // With i18n off (PUBLIC_I18N_ENABLED unset) no locale prefix is served at
    // all — `/vi/…` and legacy `/en/…` both 301 to the plain URL. When it is
    // on, only the default locale is prefix-less
    // (routing.prefixDefaultLocale: false) and `/en/…` stays.
    if (!I18N_ENABLED || firstSegment === DEFAULT_LOCALE) {
      return redirectTo(target);
    }
    locale = firstSegment;
    appSegments = rest;
  } else if (firstSegment) {
    // The region map exists only to recognise legacy market prefixes
    // (`/dk/store`), so the lookup happens here — after the pure path
    // redirects above, which keep working even when Medusa is down. A
    // backend that cannot answer is a 503 with a retry hint: never an
    // unhandled middleware error, never a wrong redirect.
    let isLegacyMarket = false;
    try {
      isLegacyMarket = (await getRegionMap()).has(firstSegment);
    } catch (error) {
      console.error("region lookup failed", error);
      return serviceUnavailable();
    }

    if (isLegacyMarket) {
      // The market now lives in the cookie, so drop the segment and keep
      // the visitor on the equivalent page.
      const rest = segments.slice(1);
      return redirectTo(rest.length ? `/${rest.join("/")}` : "/");
    }

    if (!ROUTE_ROOTS.has(firstSegment)) {
      // Static routes already won above — what is left may only be a category
      // handle (flat `/{handle}` or `/{parent}/{child}`), 301'd when it was
      // renamed, and 404 for anything else.
      let taxonomy: Taxonomy;
      try {
        taxonomy = await getTaxonomy();
      } catch (error) {
        console.error("taxonomy lookup failed", error);
        return serviceUnavailable();
      }

      const resolution = resolveFlatPath(appSegments, taxonomy);
      if (resolution.kind === "not-found") return notFound();
      if (resolution.kind === "redirect") {
        return redirectTo(resolution.path, 301, resolution.search);
      }

      const target = normalizeCatalogQuery(
        `/${appSegments.join("/")}`,
        search,
        "category",
        taxonomy,
      );
      if (target) return redirectTo(target.path, 301, target.search);
    }
  }

  // Deeper-than-supported paths must 404 rather than fall through to the
  // catch-all landing route (a soft 404 would be worse than no page). The
  // one supported 3-deep account path is an order detail
  // (`tai-khoan/don-hang/order_…`) — its id is Medusa-cased, hence the exact
  // segment checks instead of a prefix match.
  const isOrderDetailPath =
    appSegments.length === 3 &&
    appSegments[0] === "tai-khoan" &&
    appSegments[1] === "don-hang";
  if (
    appSegments.length > 2 &&
    !isOrderDetailPath &&
    ROUTE_ROOTS.has(appSegments[0] ?? "")
  ) {
    return notFound();
  }

  // Catalogue query normalisation: ids become slugs, repeated keys and comma
  // lists collapse into one sorted value, params are re-ordered into the
  // canonical sequence, invalid values are dropped, and a single remaining
  // filter 301s to its clean `/handle` or `/bo-suu-tap/handle` URL.
  const appPath = `/${appSegments.join("/")}`;
  const pageType = detectPageType(appSegments);
  if (pageType && search) {
    let taxonomy: Taxonomy;
    try {
      taxonomy = await getTaxonomy();
    } catch (error) {
      console.error("taxonomy lookup failed", error);
      return serviceUnavailable();
    }
    const target = normalizeCatalogQuery(appPath, search, pageType, taxonomy);
    if (target) return redirectTo(target.path, 301, target.search);
  }

  const cookieCountry = context.cookies.get("country")?.value;
  let countryCode: string | undefined;
  try {
    countryCode = await resolveMarketCountry(cookieCountry);
  } catch (error) {
    // The region map is served by Medusa: a down backend is a 503 with a
    // retry hint, never an unhandled 500.
    console.error("region lookup failed", error);
    return serviceUnavailable();
  }

  if (countryCode) {
    context.locals.locale = locale;
    context.locals.countryCode = countryCode;
  }

  const response = await next();

  // Edge-cache policy for rendered HTML: failures are never stored, the
  // per-visitor app routes stay private, and everything else is shareable —
  // but only between visitors of the same market, because the country cookie
  // picks the region and therefore the prices. Hence `Vary: Cookie` for the
  // shared cache, while the browser itself always revalidates (`max-age=0`).
  if (response.status >= 500 || PER_VISITOR_ROOTS.has(appSegments[0] ?? "")) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!response.headers.has("Cache-Control")) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
    );
    response.headers.append("Vary", "Cookie");
  }

  return response;
};

/**
 * One post-processing pass over every response the handler can produce —
 * rendered pages, redirects, 404s, 503s and static passthrough — so the
 * security posture lives in a single list. Deliberately conservative:
 * no full CSP (the inline reveal script and Astro islands make that a
 * separate project), just framing/clickjacking, sniffing, referrer and
 * feature-policy hygiene. Browsers ignore HSTS on plain http, so it is
 * sent unconditionally — only clients that already reached https store it.
 */
const secureHeaders = (response: Response): Response => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), geolocation=(), microphone=()",
  );
  response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
};

export const onRequest = defineMiddleware(async (context, next) =>
  secureHeaders(await handle(context, next)),
);
