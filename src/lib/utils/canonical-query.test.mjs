import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareSizes,
  emptyCatalogState,
  normalizeSearch,
  resolveCanonical,
  serializeCatalogState,
} from "./canonical-query.ts";

const LIVE_CATEGORIES = ["dam-va-vay", "giay-dep", "phu-kien", "quan-nam"];
const CATEGORY_IDS = {
  pcat_giay: "giay-dep",
  pcat_phu: "phu-kien",
  pcat_quan: "quan-nam",
  PCAT_MixedID: "tui-xach",
};
const COLLECTION_IDS = { pcol_classic: "ao-so-mi-caro-co-dien" };
const LIVE_COLLECTIONS = ["ao-so-mi-caro-co-dien", "t-shirt"];

const resolvers = {
  resolveCategory: (value) =>
    CATEGORY_IDS[value] ?? (LIVE_CATEGORIES.includes(value) ? value : null),
  resolveCollection: (value) =>
    COLLECTION_IDS[value] ?? (LIVE_COLLECTIONS.includes(value) ? value : null),
};

const search = (query) => normalizeSearch(query, resolvers);

describe("normalizeSearch", () => {
  it("maps ids to slugs and sorts repeated keys", () => {
    const { state } = search("?category=pcat_quan&category=pcat_giay");
    assert.deepEqual(state.category, ["giay-dep", "quan-nam"]);
  });

  it("accepts comma lists, trims and deduplicates them", () => {
    const { state } = search("?category=phu-kien,%20giay-dep,giay-dep");
    assert.deepEqual(state.category, ["giay-dep", "phu-kien"]);
  });

  it("drops values that are neither a live id nor a live handle", () => {
    const { state } = search("?category=khong-ton-tai&collection=pcol_x");
    assert.deepEqual(state.category, []);
    assert.deepEqual(state.collection, []);
  });

  it("keeps id case but accepts a hand-typed handle in any case", () => {
    const { state } = search("?category=Giay-Dep&category=PCAT_MixedID");
    assert.deepEqual(state.category, ["giay-dep", "tui-xach"]);
  });

  it("drops unparseable prices and swaps an inverted range", () => {
    assert.equal(search("?price_min=abc").state.price_min, null);

    const inverted = search("?price_min=1500000&price_max=200000").state;
    assert.equal(inverted.price_min, 200000);
    assert.equal(inverted.price_max, 1500000);

    // Vietnamese formatting and a currency suffix are still one number.
    assert.equal(search("?price_max=1.500.000%C4%91").state.price_max, 1500000);
  });

  it("keeps only a known sort and only pages past the first", () => {
    const kept = search("?sort=price_asc&page=2").state;
    assert.equal(kept.sort, "price_asc");
    assert.equal(kept.page, 2);

    const dropped = search("?sort=cheapest&page=1&page=abc&page=0").state;
    assert.equal(dropped.sort, null);
    assert.equal(dropped.page, null);

    // The default order is never spelled out — `?sort=newest` is redundant.
    assert.equal(search("?sort=newest").state.sort, null);
  });

  it("orders size values naturally: numbers, then S < M < L < XL", () => {
    const { state } = search("?size=xl,42,s,40,m");
    assert.deepEqual(state.size, ["40", "42", "s", "m", "xl"]);
  });

  it("separates campaign params from the ones it manages", () => {
    const { tracking, passthrough, hasFilterParams } = search(
      "?category=giay-dep&utm_source=fb&ref=partner",
    );
    assert.deepEqual(tracking, [["utm_source", "fb"]]);
    assert.deepEqual(passthrough, [["ref", "partner"]]);
    assert.equal(hasFilterParams, true);
    assert.equal(search("?utm_source=fb").hasFilterParams, false);
  });
});

describe("resolveCanonical", () => {
  it("collapses a lone category onto its flat page", () => {
    const state = emptyCatalogState();
    state.category = ["giay-dep"];
    assert.deepEqual(
      resolveCanonical({ pageType: "store", path: "/store", state }),
      { path: "/giay-dep", search: "" },
    );
  });

  it("collapses a lone collection onto its collection page", () => {
    const state = emptyCatalogState();
    state.collection = ["t-shirt"];
    assert.deepEqual(
      resolveCanonical({ pageType: "store", path: "/store", state }),
      { path: "/bo-suu-tap/t-shirt", search: "" },
    );
  });

  it("keeps multi-filter states on /store in canonical param order", () => {
    const state = emptyCatalogState();
    state.page = 2;
    state.sort = "price_asc";
    state.category = ["phu-kien", "giay-dep"];
    state.collection = ["t-shirt"];
    assert.deepEqual(
      resolveCanonical({ pageType: "store", path: "/store", state }),
      {
        path: "/store",
        search:
          "?category=giay-dep,phu-kien&collection=t-shirt&sort=price_asc&page=2",
      },
    );
  });

  it("a price range blocks the collapse to a clean category URL", () => {
    const state = emptyCatalogState();
    state.category = ["giay-dep"];
    state.price_min = 200000;
    assert.deepEqual(
      resolveCanonical({ pageType: "store", path: "/store", state }),
      { path: "/store", search: "?category=giay-dep&price_min=200000" },
    );
  });

  it("a category page never leaves its own path", () => {
    const state = emptyCatalogState();
    state.collection = ["t-shirt"];
    assert.deepEqual(
      resolveCanonical({ pageType: "category", path: "/giay-dep", state }),
      { path: "/giay-dep", search: "?collection=t-shirt" },
    );
  });

  it("keeps campaign params after the filters", () => {
    const state = emptyCatalogState();
    state.category = ["phu-kien", "giay-dep"];
    assert.deepEqual(
      resolveCanonical({
        pageType: "store",
        path: "/store",
        state,
        tracking: [["utm_source", "fb"]],
      }),
      { path: "/store", search: "?category=giay-dep,phu-kien&utm_source=fb" },
    );
  });
});

describe("serializeCatalogState", () => {
  it("emits the fixed parameter order", () => {
    const state = emptyCatalogState();
    state.page = 2;
    state.sort = "price_asc";
    state.price_min = 1;
    state.collection = ["t-shirt"];
    state.category = ["phu-kien", "giay-dep"];

    assert.equal(
      serializeCatalogState(state),
      "category=giay-dep,phu-kien&collection=t-shirt&price_min=1&sort=price_asc&page=2",
    );
  });

  it("omits everything that is not set", () => {
    assert.equal(serializeCatalogState(emptyCatalogState()), "");
  });
});

describe("compareSizes", () => {
  it("sorts numbers ascending and before letters, letters S..XXL", () => {
    assert.deepEqual(["xl", "42", "s", "40", "m", "l"].sort(compareSizes), [
      "40",
      "42",
      "s",
      "m",
      "l",
      "xl",
    ]);
  });
});
