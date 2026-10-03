/**
 * Pure builders for the structured data and sitemap the pages inject.
 *
 * Everything here is deliberately side-effect free: the `.astro` templates
 * only serialize what these functions return, so the shapes can be unit
 * tested without rendering a page. `origin` is the public site origin
 * (`https://demostore.ceonogy.com`) — schema.org URLs must be absolute.
 */

export type JsonLdNode = Record<string, unknown>;

const ABSOLUTE = /^https?:\/\//i;

/** Joins a site-relative path (or keeps an absolute URL) onto the origin. */
export const toAbsolute = (origin: string, url: string): string => {
  if (ABSOLUTE.test(url)) return url;
  return `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
};

/** Structured data is text: strip any markup a description may carry. */
const plainText = (value: string): string => value.replace(/<[^>]*>/g, "");

export type Crumb = {
  name: string;
  /** Path the crumb points at; omit only when it names the current page. */
  path?: string;
};

export const breadcrumbJsonLd = (
  items: Crumb[],
  origin: string,
): JsonLdNode => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    ...(item.path ? { item: toAbsolute(origin, item.path) } : {}),
  })),
});

export const itemListJsonLd = (
  items: { name: string; path: string }[],
  origin: string,
): JsonLdNode => ({
  "@type": "ItemList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    url: toAbsolute(origin, item.path),
  })),
});

export type ProductJsonLdInput = {
  name: string;
  description?: string | null;
  /** Site-relative product path, e.g. `/store/ao-so-mi-caro-xanh-den`. */
  path: string;
  images?: (string | null | undefined)[];
  /** Lowest variant price in the region's currency, when priced. */
  price?: number | null;
  currencyCode?: string | null;
  inStock: boolean;
  /** Store name used for the brand node. */
  siteName: string;
};

/**
 * Google's Product shape. The offer is omitted when the product has no
 * calculated price (unpriced catalogue entries must not claim one), and the
 * availability reflects what the variants actually say: unmanaged inventory
 * or backorderable variants are sellable, a managed+non-backorderable
 * variant is only in stock while its quantity lasts.
 */
export const productJsonLd = (
  input: ProductJsonLdInput,
  origin: string,
): JsonLdNode => {
  const images = (input.images ?? [])
    .filter((image): image is string => Boolean(image))
    .map((image) => toAbsolute(origin, image));
  const url = toAbsolute(origin, input.path);

  const offers =
    typeof input.price === "number" && input.currencyCode
      ? {
          "@type": "Offer",
          url,
          priceCurrency: input.currencyCode.toUpperCase(),
          price: input.price,
          availability: input.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        }
      : null;

  return {
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: plainText(input.description) } : {}),
    url,
    ...(images.length ? { image: images } : {}),
    brand: { "@type": "Brand", name: input.siteName },
    ...(offers ? { offers } : {}),
  };
};

export const webSiteJsonLd = (name: string, origin: string): JsonLdNode => ({
  "@type": "WebSite",
  name,
  url: `${origin}/`,
});

export const organizationJsonLd = (
  name: string,
  origin: string,
  logoPath: string,
): JsonLdNode => ({
  "@type": "Organization",
  name,
  url: `${origin}/`,
  logo: toAbsolute(origin, logoPath),
});

/* ---------------------------------------------------------------- sitemap */

export type SitemapEntry = {
  loc: string;
  /** W3C datetime (a plain date is valid); omitted when unknown. */
  lastmod?: string;
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Serialises entries as a sitemap 0.9 urlset. */
export const buildSitemapXml = (entries: SitemapEntry[]): string => {
  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>` +
        (entry.lastmod
          ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
          : "") +
        `\n  </url>`,
    )
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urls}\n</urlset>\n`
  );
};
