import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAddressLines, formatLocality } from "./address.ts";

describe("formatLocality", () => {
  it("renders ward then province (the reported order #12 case)", () => {
    assert.equal(
      formatLocality({ city: "Phường Bắc Giang", province: "Bắc Ninh" }),
      "Phường Bắc Giang, Bắc Ninh",
    );
  });

  it("never drops the province when a ward is present", () => {
    // Regression: the confirmation page used to print only `city`.
    assert.notEqual(
      formatLocality({ city: "Phường Đa Mai", province: "Bắc Ninh" }),
      "Phường Đa Mai",
    );
  });

  it("falls back to whichever part exists", () => {
    assert.equal(formatLocality({ province: "Bắc Ninh" }), "Bắc Ninh");
    assert.equal(
      formatLocality({ city: "Phường Bắc Giang" }),
      "Phường Bắc Giang",
    );
  });

  it("returns an empty string for blank/missing addresses", () => {
    assert.equal(formatLocality(null), "");
    assert.equal(formatLocality(undefined), "");
    assert.equal(formatLocality({ city: "", province: null }), "");
  });
});

describe("formatAddressLines", () => {
  it("orders street lines before the locality", () => {
    assert.deepEqual(
      formatAddressLines({
        address_1: "12 Lê Lợi",
        address_2: "Tầng 3",
        city: "Phường Bắc Giang",
        province: "Bắc Ninh",
      }),
      ["12 Lê Lợi", "Tầng 3", "Phường Bắc Giang, Bắc Ninh"],
    );
  });

  it("skips empty parts", () => {
    assert.deepEqual(
      formatAddressLines({
        address_1: "12 Lê Lợi",
        city: "Phường Bắc Giang",
        province: "Bắc Ninh",
      }),
      ["12 Lê Lợi", "Phường Bắc Giang, Bắc Ninh"],
    );
    assert.deepEqual(formatAddressLines({}), []);
    assert.deepEqual(formatAddressLines(null), []);
  });
});
