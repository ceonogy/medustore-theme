import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyCatalogState } from "./canonical-query.ts";
import {
  buildFacetGroups,
  facetOptionLabel,
  filterCatalog,
  paginateCatalog,
  priceBoundsOf,
  sizeValuesOf,
  sortCatalog,
} from "./catalog.ts";

const product = (id, overrides = {}) => {
  const prices = overrides.prices ?? [100000];
  const sizes = overrides.sizes;
  return {
    id,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    // Default origin keeps existing fixtures placeable; `origin: null` in an
    // override models a product that carries none.
    origin_country: "origin" in overrides ? overrides.origin : "vn",
    categories: (overrides.categories ?? []).map((handle) => ({
      id: `pcat_${handle}`,
      name: handle,
      handle,
    })),
    collection: overrides.collection
      ? {
          id: `pcol_${overrides.collection}`,
          title: overrides.collection,
          handle: overrides.collection,
        }
      : null,
    options: sizes === undefined ? [] : [{ id: "opt_size", title: "Kích cỡ" }],
    variants:
      sizes === undefined
        ? prices.map((amount) => ({
            calculated_price: { calculated_amount: amount },
          }))
        : sizes.map((size, index) => ({
            calculated_price: {
              calculated_amount: prices[index] ?? prices[0],
            },
            options: [
              {
                value: size,
                option_id: "opt_size",
                option: { title: "Kích cỡ" },
              },
            ],
          })),
  };
};

const CATALOG = [
  product("p1", {
    created_at: "2026-01-04T00:00:00.000Z",
    categories: ["giay-dep"],
    collection: "t-shirt",
    prices: [500000],
    sizes: ["39", "40"],
    origin: "vn",
  }),
  product("p2", {
    created_at: "2026-01-03T00:00:00.000Z",
    categories: ["giay-dep", "phu-kien"],
    prices: [900000, 200000],
    sizes: ["S", "M"],
    origin: "cn",
  }),
  product("p3", {
    created_at: "2026-01-02T00:00:00.000Z",
    categories: ["phu-kien"],
    collection: "t-shirt",
    prices: [100000],
    origin: null,
  }),
  product("p4", {
    created_at: "2026-01-01T00:00:00.000Z",
    categories: ["quan-nam"],
    prices: [300000],
    sizes: ["30", "31"],
    origin: "th",
  }),
];

const state = (overrides = {}) => ({ ...emptyCatalogState(), ...overrides });

describe("filterCatalog", () => {
  it("ORs values inside one facet group", () => {
    const result = filterCatalog(
      CATALOG,
      state({ category: ["giay-dep", "quan-nam"] }),
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ["p1", "p2", "p4"],
    );
  });

  it("ANDs across facet groups", () => {
    const result = filterCatalog(
      CATALOG,
      state({ category: ["giay-dep"], collection: ["t-shirt"] }),
    );
    assert.deepEqual(
      result.map((item) => item.id),
      ["p1"],
    );
  });

  it("applies the selection the URL path carries", () => {
    assert.deepEqual(
      filterCatalog(CATALOG, emptyCatalogState(), {
        pathCategories: ["phu-kien"],
      }).map((item) => item.id),
      ["p2", "p3"],
    );
    assert.deepEqual(
      filterCatalog(CATALOG, emptyCatalogState(), {
        pathCollection: "t-shirt",
      }).map((item) => item.id),
      ["p1", "p3"],
    );
  });
});

describe("price filtering", () => {
  it("keeps products with a variant inside the range", () => {
    assert.deepEqual(
      filterCatalog(CATALOG, state({ price_min: 400000 })).map((p) => p.id),
      ["p1", "p2"],
    );
    assert.deepEqual(
      filterCatalog(CATALOG, state({ price_max: 250000 })).map((p) => p.id),
      ["p2", "p3"],
    );
    // p2 spans 200k–900k but has no single variant between 400k and 800k.
    assert.deepEqual(
      filterCatalog(
        CATALOG,
        state({ price_min: 400000, price_max: 800000 }),
      ).map((p) => p.id),
      ["p1"],
    );
  });

  it("ands the range with the facet selections", () => {
    assert.deepEqual(
      filterCatalog(
        CATALOG,
        state({ category: ["giay-dep"], price_min: 800000 }),
      ).map((p) => p.id),
      ["p2"],
    );
  });

  it("drops unpriced products only while a bound is set", () => {
    const withUnpriced = [...CATALOG, product("p5", { prices: [] })];

    assert.ok(
      filterCatalog(withUnpriced, emptyCatalogState()).some(
        (p) => p.id === "p5",
      ),
    );
    assert.ok(
      !filterCatalog(withUnpriced, state({ price_min: 1 })).some(
        (p) => p.id === "p5",
      ),
    );
  });
});

describe("priceBoundsOf", () => {
  it("spans every variant price in the catalogue", () => {
    assert.deepEqual(priceBoundsOf(CATALOG), { min: 100000, max: 900000 });
  });

  it("is null when nothing is priced", () => {
    assert.equal(priceBoundsOf([]), null);
    assert.equal(priceBoundsOf([product("x", { prices: [] })]), null);
  });
});

describe("sortCatalog", () => {
  it("defaults to newest first", () => {
    assert.deepEqual(
      sortCatalog(CATALOG, null).map((item) => item.id),
      ["p1", "p2", "p3", "p4"],
    );
  });

  it("orders by the cheapest variant in both directions", () => {
    assert.deepEqual(
      sortCatalog(CATALOG, "price_asc").map((item) => item.id),
      ["p3", "p2", "p4", "p1"],
    );
    assert.deepEqual(
      sortCatalog(CATALOG, "price_desc").map((item) => item.id),
      ["p1", "p4", "p2", "p3"],
    );
  });
});

describe("paginateCatalog", () => {
  it("slices the page and reports the totals", () => {
    const page = paginateCatalog([1, 2, 3, 4, 5], null, 2);
    assert.deepEqual(page, {
      items: [1, 2],
      count: 5,
      page: 1,
      pageCount: 3,
      beyond: false,
    });
  });

  it("flags a page past the end as beyond", () => {
    const page = paginateCatalog([1, 2, 3], 99, 2);
    assert.equal(page.beyond, true);
    assert.deepEqual(page.items, []);
  });

  it("keeps an empty result set on its single valid page", () => {
    assert.equal(paginateCatalog([], 1, 12).beyond, false);
    assert.equal(paginateCatalog([], 2, 12).beyond, true);
  });
});

describe("buildFacetGroups", () => {
  it("counts a group against the other filters, not its own", () => {
    const groups = buildFacetGroups(CATALOG, state({ category: ["giay-dep"] }));
    const categories = groups.find((group) => group.key === "category");

    assert.deepEqual(
      categories.options.map((option) => [option.value, option.count]),
      [
        ["giay-dep", 2],
        ["phu-kien", 2],
        ["quan-nam", 1],
      ],
    );
  });

  it("never offers a value that matches no product", () => {
    const groups = buildFacetGroups(CATALOG, state());
    const collections = groups.find((group) => group.key === "collection");

    assert.deepEqual(
      collections.options.map((option) => option.value),
      ["t-shirt"],
    );
    assert.deepEqual(buildFacetGroups([], state()), []);
  });

  it("never offers the category the page path already selects", () => {
    const groups = buildFacetGroups(CATALOG, state(), {
      primaryCategory: "giay-dep",
    });
    const categories = groups.find((group) => group.key === "category");

    assert.ok(
      !categories.options.some((option) => option.value === "giay-dep"),
    );
    assert.ok(categories.options.some((option) => option.value === "phu-kien"));
  });

  it("orders sizes by magnitude and shows letters in natural casing", () => {
    const groups = buildFacetGroups(CATALOG, state());
    const sizes = groups.find((group) => group.key === "size");

    assert.deepEqual(
      sizes.options.map((option) => [option.value, option.label, option.count]),
      [
        ["30", "30", 1],
        ["31", "31", 1],
        ["39", "39", 1],
        ["40", "40", 1],
        ["s", "S", 1],
        ["m", "M", 1],
      ],
    );
  });

  it("counts a size group ignoring its own selection, origins likewise", () => {
    const groups = buildFacetGroups(CATALOG, state({ size: ["40"] }));
    const sizes = groups.find((group) => group.key === "size");
    const origins = groups.find((group) => group.key === "origin");

    // The size facet still offers everything (its selection is excluded)…
    assert.deepEqual(
      sizes.options.map((option) => option.value),
      ["30", "31", "39", "40", "s", "m"],
    );
    // …while the origin facet counts within what the *other* filters leave:
    // size 40 is p1 alone, and p1 comes from Vietnam.
    assert.deepEqual(
      origins.options.map((option) => [option.value, option.count]),
      [["vn", 1]],
    );
  });

  it("sorts origins by their Vietnamese country names", () => {
    const groups = buildFacetGroups(CATALOG, state());
    const origins = groups.find((group) => group.key === "origin");

    // Thái Lan < Trung Quốc < Việt Nam under the vi collation.
    assert.deepEqual(
      origins.options.map((option) => [option.value, option.count]),
      [
        ["th", 1],
        ["cn", 1],
        ["vn", 1],
      ],
    );
  });

  it("hides the size and origin groups when nothing carries them", () => {
    const groups = buildFacetGroups(
      [product("x", { origin: null, prices: [100] })],
      state(),
    );

    assert.ok(!groups.some((group) => group.key === "size"));
    assert.ok(!groups.some((group) => group.key === "origin"));
  });
});

describe("size and origin filtering", () => {
  it("matches size values case-insensitively (URL lowercase, data as stored)", () => {
    assert.deepEqual(
      filterCatalog(CATALOG, state({ size: ["s"] })).map((item) => item.id),
      ["p2"],
    );
    assert.deepEqual(
      filterCatalog(CATALOG, state({ size: ["40"] })).map((item) => item.id),
      ["p1"],
    );
  });

  it("ORs sizes and never reaches products without one", () => {
    assert.deepEqual(
      filterCatalog(CATALOG, state({ size: ["s", "40"] })).map(
        (item) => item.id,
      ),
      ["p1", "p2"],
    );
  });

  it("ANDs size with origin and the other groups", () => {
    assert.deepEqual(
      filterCatalog(CATALOG, state({ size: ["40"], origin: ["cn"] })).map(
        (item) => item.id,
      ),
      [],
    );
    assert.deepEqual(
      filterCatalog(
        CATALOG,
        state({ category: ["giay-dep"], size: ["s"] }),
      ).map((item) => item.id),
      ["p2"],
    );
    assert.deepEqual(
      filterCatalog(CATALOG, state({ origin: ["vn", "th"] })).map(
        (item) => item.id,
      ),
      ["p1", "p4"],
    );
  });

  it("drops origin-less products only while an origin is selected", () => {
    assert.ok(
      filterCatalog(CATALOG, emptyCatalogState()).some(
        (item) => item.id === "p3",
      ),
    );
    assert.ok(
      !filterCatalog(CATALOG, state({ origin: ["vn"] })).some(
        (item) => item.id === "p3",
      ),
    );
  });
});

describe("sizeValuesOf", () => {
  it("reads the option title through the product when the nested one is missing", () => {
    assert.deepEqual(
      sizeValuesOf({
        id: "p",
        options: [{ id: "opt_1", title: "Kích cỡ" }],
        variants: [
          { id: "v1", sku: "a", options: [{ value: "M", option_id: "opt_1" }] },
          {
            id: "v2",
            sku: "b",
            options: [{ value: "XL", option_id: "opt_1" }],
          },
        ],
      }),
      ["m", "xl"],
    );
  });

  it("ignores other options while accepting the English size title", () => {
    assert.deepEqual(
      sizeValuesOf({
        id: "p",
        options: [
          { id: "opt_color", title: "Màu sắc" },
          { id: "opt_size", title: "Size" },
        ],
        variants: [
          {
            id: "v1",
            sku: "a",
            options: [
              { value: "xanh", option_id: "opt_color" },
              { value: "40", option_id: "opt_size" },
            ],
          },
        ],
      }),
      ["40"],
    );
  });
});

describe("facetOptionLabel", () => {
  it("names countries the way the product page does", () => {
    assert.equal(facetOptionLabel("origin", "vn", "vi"), "Việt Nam");
    assert.equal(
      facetOptionLabel("origin", "unknown-code", "vi"),
      "unknown-code",
    );
  });

  it("uppercases letter sizes and leaves numbers alone", () => {
    assert.equal(facetOptionLabel("size", "xl"), "XL");
    assert.equal(facetOptionLabel("size", "40"), "40");
  });

  it("returns other keys verbatim", () => {
    assert.equal(facetOptionLabel("category", "giay-dep"), "giay-dep");
  });
});
