import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyCatalogState } from "./canonical-query.ts";
import {
  buildFacetGroups,
  filterCatalog,
  paginateCatalog,
  sortCatalog,
} from "./catalog.ts";

const product = (id, overrides = {}) => ({
  id,
  created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
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
  variants: (overrides.prices ?? [100000]).map((amount) => ({
    calculated_price: { calculated_amount: amount },
  })),
});

const CATALOG = [
  product("p1", {
    created_at: "2026-01-04T00:00:00.000Z",
    categories: ["giay-dep"],
    collection: "t-shirt",
    prices: [500000],
  }),
  product("p2", {
    created_at: "2026-01-03T00:00:00.000Z",
    categories: ["giay-dep", "phu-kien"],
    prices: [900000, 200000],
  }),
  product("p3", {
    created_at: "2026-01-02T00:00:00.000Z",
    categories: ["phu-kien"],
    collection: "t-shirt",
    prices: [100000],
  }),
  product("p4", {
    created_at: "2026-01-01T00:00:00.000Z",
    categories: ["quan-nam"],
    prices: [300000],
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
});
