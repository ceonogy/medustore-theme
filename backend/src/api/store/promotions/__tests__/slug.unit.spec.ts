import { slugify } from "../slug";

describe("slugify", () => {
  it("strips Vietnamese accents and maps đ to d", () => {
    expect(slugify("Giảm 10%")).toBe("giam-10");
    expect(slugify("Đầm đỏ - đợt hai")).toBe("dam-do-dot-hai");
    expect(slugify("Khuyến mãi mùa thu")).toBe("khuyen-mai-mua-thu");
  });

  it("collapses separators and trims the edges", () => {
    expect(slugify("  Áo Sơ Mi  Caro!! ")).toBe("ao-so-mi-caro");
    expect(slugify("---Giảm giá---")).toBe("giam-gia");
  });

  it("keeps digits and ascii untouched", () => {
    expect(slugify("Sale 50% OFF")).toBe("sale-50-off");
    expect(slugify("áo-đẹp-2026")).toBe("ao-dep-2026");
  });

  it("returns an empty slug for titles with no ascii at all", () => {
    // The route falls back to the price list id when this happens.
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });
});
