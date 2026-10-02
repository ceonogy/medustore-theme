import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyCatalogState } from "./canonical-query.ts";
import {
  PRICE_STEP,
  ceilToStep,
  clampPrice,
  floorToStep,
  initialRange,
  parsePriceInput,
  sliderBounds,
  withPrice,
} from "./price-range.ts";

const state = (overrides = {}) => ({ ...emptyCatalogState(), ...overrides });

describe("step and parsing", () => {
  it("moves in 10,000 ₫ steps", () => {
    assert.equal(PRICE_STEP, 10000);
    assert.equal(floorToStep(155000), 150000);
    assert.equal(ceilToStep(155001), 160000);
    assert.equal(floorToStep(400000), 400000);
    assert.equal(ceilToStep(400000), 400000);
  });

  it("clamps values into the slider ends", () => {
    assert.equal(clampPrice(50, 100, 500), 100);
    assert.equal(clampPrice(999, 100, 500), 500);
    assert.equal(clampPrice(300, 100, 500), 300);
  });

  it("reads digits out of formatted input", () => {
    assert.equal(parsePriceInput("450000"), 450000);
    assert.equal(parsePriceInput("450.000"), 450000);
    assert.equal(parsePriceInput("450 000"), 450000);
    assert.equal(parsePriceInput(""), null);
    assert.equal(parsePriceInput("abc"), null);
  });
});

describe("sliderBounds", () => {
  it("snaps the ends outward so every price stays reachable", () => {
    assert.deepEqual(sliderBounds({ min: 155000, max: 987001 }), {
      low: 150000,
      high: 990000,
    });
  });
});

describe("initialRange", () => {
  const { low, high } = sliderBounds({ min: 100000, max: 900000 });

  it("starts at the full range when the URL says nothing", () => {
    assert.deepEqual(initialRange(state(), low, high), {
      min: low,
      max: high,
    });
  });

  it("starts from the URL state, clamped into the track", () => {
    assert.deepEqual(initialRange(state({ price_min: 450000 }), low, high), {
      min: 450000,
      max: high,
    });
    // A value past the end never escapes the track (the middleware already
    // swapped inverted bounds before the island ever sees them).
    assert.deepEqual(initialRange(state({ price_min: 99999999 }), low, high), {
      min: high,
      max: high,
    });
  });
});

describe("withPrice", () => {
  it("clears a bound that covers the whole slider", () => {
    const next = withPrice(
      state({ price_min: 450000, page: 2 }),
      { min: 100000, max: 900000 },
      100000,
      900000,
    );
    assert.equal(next.price_min, null);
    assert.equal(next.price_max, null);
    assert.equal(next.page, null);
  });

  it("keeps a partial range and the rest of the state", () => {
    const next = withPrice(
      state({ category: ["giay-dep"], sort: "price_asc", page: 3 }),
      { min: 450000, max: 900000 },
      100000,
      900000,
    );
    assert.equal(next.price_min, 450000);
    assert.equal(next.price_max, null);
    assert.equal(next.page, null);
    assert.deepEqual(next.category, ["giay-dep"]);
    assert.equal(next.sort, "price_asc");
  });

  it("keeps a single-ended range", () => {
    const next = withPrice(
      state({ price_max: 700000 }),
      { min: 100000, max: 700000 },
      100000,
      900000,
    );
    assert.equal(next.price_min, null);
    assert.equal(next.price_max, 700000);
  });
});
