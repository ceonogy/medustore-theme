import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayVariantTitle } from "./variant-title.ts";

describe("displayVariantTitle", () => {
  it("hides placeholder default titles", () => {
    for (const title of [
      "Mặc định",
      "mặc định",
      "  MẶC ĐỊNH  ",
      "Mac dinh",
      "Biến thể mặc định",
      "Default",
      "default variant",
    ]) {
      assert.equal(displayVariantTitle(title), null, title);
    }
  });

  it("hides empty / missing titles", () => {
    for (const title of ["", "   ", null, undefined]) {
      assert.equal(displayVariantTitle(title), null, String(title));
    }
  });

  it("keeps real option values, trimmed", () => {
    assert.equal(displayVariantTitle("Bạc"), "Bạc");
    assert.equal(displayVariantTitle("  Đỏ  "), "Đỏ");
    assert.equal(displayVariantTitle("Size M"), "Size M");
  });
});
