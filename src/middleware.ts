import type { HttpTypes } from "@medusajs/types";
import { defineMiddleware } from "astro:middleware";
import {
  DEFAULT_LOCALE,
  I18N_ENABLED,
  isLocale,
  type Locale,
} from "./i18n/config";
import { sdk } from "./lib/sdk";

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

export const onRequest = defineMiddleware(async (context, next) => {
  // Never redirect non-page requests (assets, dev internals, etc.)
  if (isStaticOrInternalPath(context.url.pathname)) {
    return next();
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
  // fall through to the catch-all landing page.
  const ROUTE_ROOTS = new Set([
    "store",
    "cart",
    "checkout",
    "privacy",
    "terms",
    "order",
  ]);

  const regionMap = await getRegionMap();

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

  const redirectTo = (path: string, status: 301 | 308 | 307 = 301) =>
    context.redirect(`${origin}${path}${search}`, status);

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
  } else if (firstSegment && regionMap.has(firstSegment)) {
    // Legacy `/dk/store` market URLs → the market now lives in the cookie,
    // so drop the segment and keep the visitor on the equivalent page.
    const rest = segments.slice(1);
    return redirectTo(rest.length ? `/${rest.join("/")}` : "/");
  } else if (firstSegment && !ROUTE_ROOTS.has(firstSegment)) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const cookieCountry = context.cookies.get("country")?.value;
  const countryCode = await resolveMarketCountry(cookieCountry);

  if (!countryCode) {
    return next();
  }

  context.locals.locale = locale;
  context.locals.countryCode = countryCode;

  return next();
});
