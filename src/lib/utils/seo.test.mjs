import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  breadcrumbJsonLd,
  buildSitemapXml,
  itemListJsonLd,
  organizationJsonLd,
  productJsonLd,
  toAbsolute,
  webSiteJsonLd,
} from "./seo.ts";

const ORIGIN = "https://demostore.ceonogy.com";

describe("toAbsolute", () => {
  it("joins site-relative paths onto the origin", () => {
    assert.equal(
      toAbsolute(ORIGIN, "/store/x"),
      "https://demostore.ceonogy.com/store/x",
    );
    assert.equal(
      toAbsolute(ORIGIN, "store/x"),
      "https://demostore.ceonogy.com/store/x",
    );
  });

  it("keeps absolute URLs untouched", () => {
    assert.equal(
      toAbsolute(ORIGIN, "https://cdn.example/img.png"),
      "https://cdn.example/img.png",
    );
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the crumbs and points each at its URL", () => {
    const node = breadcrumbJsonLd(
      [{ name: "Trang chủ", path: "/" }, { name: "Giày dép" }],
      ORIGIN,
    );

    assert.equal(node["@type"], "BreadcrumbList");
    assert.deepEqual(node.itemListElement, [
      {
        "@type": "ListItem",
        position: 1,
        name: "Trang chủ",
        item: "https://demostore.ceonogy.com/",
      },
      { "@type": "ListItem", position: 2, name: "Giày dép" },
    ]);
  });
});

describe("itemListJsonLd", () => {
  it("lists absolute urls with positions", () => {
    const node = itemListJsonLd(
      [
        { name: "Áo sơ mi", path: "/store/ao-so-mi" },
        { name: "Đầm", path: "/store/dam" },
      ],
      ORIGIN,
    );

    assert.equal(node["@type"], "ItemList");
    assert.deepEqual(node.itemListElement, [
      {
        "@type": "ListItem",
        position: 1,
        name: "Áo sơ mi",
        url: "https://demostore.ceonogy.com/store/ao-so-mi",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Đầm",
        url: "https://demostore.ceonogy.com/store/dam",
      },
    ]);
  });
});

describe("productJsonLd", () => {
  it("emits the offer with uppercase currency and absolute urls", () => {
    const node = productJsonLd(
      {
        name: "Áo sơ mi caro",
        description: "Mềm mại",
        path: "/store/ao-so-mi-caro",
        images: ["/img/a.png", null, "https://cdn.example/x.jpg"],
        price: 300000,
        currencyCode: "vnd",
        inStock: true,
        siteName: "Demo Store",
      },
      ORIGIN,
    );

    assert.equal(node["@type"], "Product");
    assert.equal(node.url, "https://demostore.ceonogy.com/store/ao-so-mi-caro");
    assert.deepEqual(node.image, [
      "https://demostore.ceonogy.com/img/a.png",
      "https://cdn.example/x.jpg",
    ]);
    assert.deepEqual(node.brand, { "@type": "Brand", name: "Demo Store" });
    assert.deepEqual(node.offers, {
      "@type": "Offer",
      url: "https://demostore.ceonogy.com/store/ao-so-mi-caro",
      priceCurrency: "VND",
      price: 300000,
      availability: "https://schema.org/InStock",
    });
  });

  it("reports out of stock and omits the offer when unpriced", () => {
    const sold = productJsonLd(
      {
        name: "X",
        path: "/store/x",
        price: 1000,
        currencyCode: "vnd",
        inStock: false,
        siteName: "S",
      },
      ORIGIN,
    );
    assert.equal(sold.offers.availability, "https://schema.org/OutOfStock");

    const unpriced = productJsonLd(
      {
        name: "Y",
        path: "/store/y",
        price: null,
        currencyCode: null,
        inStock: true,
        siteName: "S",
      },
      ORIGIN,
    );
    assert.equal(unpriced.offers, undefined);
  });

  it("strips markup from the description", () => {
    const node = productJsonLd(
      {
        name: "Z",
        description: "<p>Mềm <b> mại</b></p>",
        path: "/store/z",
        inStock: true,
        siteName: "S",
      },
      ORIGIN,
    );
    assert.equal(node.description, "Mềm  mại");
  });
});

describe("webSiteJsonLd / organizationJsonLd", () => {
  it("anchors at the origin root", () => {
    assert.deepEqual(webSiteJsonLd("Demo Store", ORIGIN), {
      "@type": "WebSite",
      name: "Demo Store",
      url: "https://demostore.ceonogy.com/",
    });

    const org = organizationJsonLd("Demo Store", ORIGIN, "/favicon.svg");
    assert.equal(org.logo, "https://demostore.ceonogy.com/favicon.svg");
    assert.equal(org.url, "https://demostore.ceonogy.com/");
  });
});

describe("buildSitemapXml", () => {
  it("wraps entries in a urlset with loc and optional lastmod", () => {
    const xml = buildSitemapXml([
      { loc: `${ORIGIN}/store` },
      { loc: `${ORIGIN}/store/x`, lastmod: "2026-10-01" },
    ]);

    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(
      xml.includes(
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ),
    );
    assert.ok(xml.includes(`<loc>${ORIGIN}/store</loc>`));
    assert.ok(xml.includes(`<lastmod>2026-10-01</lastmod>`));
    // The entry without a lastmod must not grow an empty one.
    assert.ok(!xml.split("<loc>")[1].includes("<lastmod>"));
  });

  it("escapes xml metacharacters", () => {
    const xml = buildSitemapXml([{ loc: "https://x.test/a?b=1&c=<2>" }]);
    assert.ok(xml.includes("b=1&amp;c=&lt;2&gt;"));
  });
});
