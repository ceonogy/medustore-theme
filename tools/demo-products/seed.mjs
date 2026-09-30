#!/usr/bin/env node
/**
 * Seeds the Demo Store catalogue: seven Vietnamese categories and twenty-five
 * fashion products with multi-image galleries, priced in VND (Việt Nam region)
 * and EUR (Europe region).
 *
 * Galleries are pulled from dummyjson.com, except for the five trousers
 * products: dummyjson stocks no pants, so those use CC0 / public-domain photos
 * from Openverse (rawpixel, StockSnap) and Wikimedia Commons instead.
 *
 * Each product also carries its detail attributes — Chất liệu, Xuất xứ, Loại,
 * Khối lượng, Kích thước — from the SPECS table below. They are patched only
 * when a value is missing or differs, so re-running against an existing
 * catalogue stays idempotent (and backfills the twenty older products).
 *
 * The four stock Medusa seed products are removed afterwards so the storefront
 * shows only Vietnamese content (pass --keep-seed-products to leave them).
 *
 * Usage:
 *   MEDUSA_ADMIN_EMAIL=admin@example.com MEDUSA_ADMIN_PASSWORD=secret \
 *     node tools/demo-products/seed.mjs [options]
 *
 * Options:
 *   --backend <url>        Medusa backend (default http://127.0.0.1:9000)
 *   --email <addr>         admin login (or MEDUSA_ADMIN_EMAIL)
 *   --password <pw>        admin login (or MEDUSA_ADMIN_PASSWORD)
 *   --only <handle>        seed a single product by handle
 *   --keep-seed-products   do not delete the stock Medusa seed products
 *   --check                report current state, change nothing
 *   --dry-run              print the planned actions, change nothing
 *   --json                 machine-readable output
 *   --quiet                 suppress progress lines
 *
 * Exit codes: 0 success · 1 request failed · 2 usage error
 *
 * Idempotent: existing categories are renamed in place and products that
 * already exist are left untouched.
 */

import process from "node:process";

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const value = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};

const BACKEND = (
  value("--backend") ??
  process.env.MEDUSA_BACKEND_URL ??
  "http://127.0.0.1:9000"
).replace(/\/$/, "");
const EMAIL = value("--email") ?? process.env.MEDUSA_ADMIN_EMAIL;
const PASSWORD = value("--password") ?? process.env.MEDUSA_ADMIN_PASSWORD;
const ONLY = value("--only");
const KEEP_SEED_PRODUCTS = has("--keep-seed-products");
const CHECK = has("--check");
const DRY_RUN = has("--dry-run");
const JSON_OUT = has("--json");
const QUIET = has("--quiet");

if (!EMAIL || !PASSWORD) {
  console.error(
    "Admin credentials are required. Set MEDUSA_ADMIN_EMAIL and " +
      "MEDUSA_ADMIN_PASSWORD (or pass --email / --password); they are " +
      "deliberately not defaulted so they never land in the repo.",
  );
  process.exit(2);
}

const PROGRESS = [];
const log = (line) => {
  if (QUIET || JSON_OUT) return;
  console.log(line);
  PROGRESS.push(line);
};

const fail = async (message, response) => {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    /* ignore */
  }
  const error = new Error(
    `${message} [${response.status}] ${detail.slice(0, 400)}`,
  );
  error.status = response.status;
  throw error;
};

// ------------------------------------------------------------------ catalogue

/** Existing categories are renamed (keeps ids, avoids dead English ones). */
const CATEGORY_PLAN = [
  { match: "Shirts", name: "Áo sơ mi", handle: "ao-so-mi" },
  { match: "Sweatshirts", name: "Đầm & Váy", handle: "dam-va-vay" },
  { match: "Pants", name: "Giày dép", handle: "giay-dep" },
  { match: "Merch", name: "Phụ kiện", handle: "phu-kien" },
  { match: null, name: "Túi xách", handle: "tui-xach" },
  { match: null, name: "Quần nam", handle: "quan-nam" },
  { match: null, name: "Quần nữ", handle: "quan-nu" },
];

const SIZE_APPAREL = { title: "Kích cỡ", values: ["S", "M", "L"] };
const SHOE_WOMEN = { title: "Kích cỡ", values: ["36", "37", "38", "39"] };
const SHOE_MEN = { title: "Kích cỡ", values: ["39", "40", "41", "42"] };

const CATALOG = [
  // ---------------------------------------------------------------- áo sơ mi
  {
    handle: "ao-so-mi-caro-xanh-den",
    dj: { category: "mens-shirts", title: "Blue & Black Check Shirt" },
    category: "Áo sơ mi",
    title: "Áo sơ mi caro xanh đen",
    subtitle: "Cotton pha, phom regular",
    description:
      "Áo sơ mi caro phối xanh – đen với chất cotton pha mềm mại, phom regular vừa vặn. Dễ phối cùng quần âu hoặc jeans, hợp đi làm lẫn đi chơi.",
    option: SIZE_APPAREL,
    price: { vnd: 490_000, eur: 18 },
  },
  {
    handle: "ao-so-mi-caro-co-dien",
    dj: { category: "mens-shirts", title: "Man Plaid Shirt" },
    category: "Áo sơ mi",
    title: "Áo sơ mi caro cổ điển",
    subtitle: "Vải pha cotton, dáng thoải mái",
    description:
      "Áo sơ mi caro tông trung tính với họa tiết caro không lỗi mốt. Chất vải thoáng nhẹ nên mặc thoải mái suốt ngày dài.",
    option: SIZE_APPAREL,
    price: { vnd: 520_000, eur: 19 },
  },
  {
    handle: "ao-so-mi-tay-ngan-thanh-lich",
    dj: { category: "mens-shirts", title: "Man Short Sleeve Shirt" },
    category: "Áo sơ mi",
    title: "Áo sơ mi tay ngắn thanh lịch",
    subtitle: "Dáng ngắn tay, chất liệu mát",
    description:
      "Áo sơ mi tay ngắn dáng gọn, phom vừa vặn giúp cơ thể thoải mái trong thời tiết nóng. Phối cùng quần short hoặc quần âu đều hợp.",
    option: SIZE_APPAREL,
    price: { vnd: 450_000, eur: 17 },
  },
  {
    handle: "ao-so-mi-ke-song-nam-tinh",
    dj: { category: "mens-shirts", title: "Men Check Shirt" },
    category: "Áo sơ mi",
    title: "Áo sơ mi kẻ sọc nam tính",
    subtitle: "Họa tiết kẻ sọc, dáng suôn",
    description:
      "Áo sơ mi kẻ sọc với đường sọc mảnh và dáng suôn thoải mái. Chất vải giữ form tốt sau nhiều lần giặt.",
    option: SIZE_APPAREL,
    price: { vnd: 470_000, eur: 17 },
  },

  // ------------------------------------------------------------- đầm & váy
  {
    handle: "dam-caro-tartan",
    dj: { category: "tops", title: "Tartan Dress" },
    category: "Đầm & Váy",
    title: "Đầm caro Tartan",
    subtitle: "Chất liệu dày dặn, dáng xòe",
    description:
      "Đầm caro Tartan dáng xòe nhẹ, tôn dáng và dễ phối cùng áo khoác. Phù hợp đi học, đi làm hoặc dạo phố cuối tuần.",
    option: SIZE_APPAREL,
    price: { vnd: 690_000, eur: 25 },
  },
  {
    handle: "dam-xam-dang-suon",
    dj: { category: "tops", title: "Gray Dress" },
    category: "Đầm & Váy",
    title: "Đầm xám dáng suôn",
    subtitle: "Tông xám trung tính, dáng suôn",
    description:
      "Đầm xám dáng suôn tối giản với phom rủ nhẹ, thoải mái suốt ngày dài. Một lựa chọn thanh lịch cho nhiều dịp.",
    option: SIZE_APPAREL,
    price: { vnd: 620_000, eur: 23 },
  },
  {
    handle: "dam-he-thoang-mat",
    dj: { category: "tops", title: "Girl Summer Dress" },
    category: "Đầm & Váy",
    title: "Đầm hè thoáng mát",
    subtitle: "Vải nhẹ thấm hút, dáng ngắn",
    description:
      "Đầm hè dáng ngắn với chất vải nhẹ và thoáng khí, lý tưởng cho những ngày nắng. Phối cùng sandal là đủ bộ.",
    option: SIZE_APPAREL,
    price: { vnd: 550_000, eur: 20 },
  },
  {
    handle: "dam-pea-xep-ly",
    dj: { category: "womens-dresses", title: "Dress Pea" },
    category: "Đầm & Váy",
    title: "Đầm pea xếp ly",
    subtitle: "Dáng pea, xếp ly mềm",
    description:
      "Đầm pea với phần xếp ly mềm ở thân tạo độ phồng vừa phải. Chất liệu đứng phom nhưng vẫn dễ chịu khi mặc.",
    option: SIZE_APPAREL,
    price: { vnd: 720_000, eur: 27 },
  },
  {
    handle: "dam-da-hoi-den",
    dj: { category: "womens-dresses", title: "Black Women's Gown" },
    category: "Đầm & Váy",
    title: "Đầm dạ hội đen",
    subtitle: "Dáng dài, phom ôm",
    description:
      "Đầm dạ hội đen dáng dài với phom ôm gọn giúp tôn đường cong. Chất liệu có độ rủ sang trọng cho các buổi tiệc tối.",
    option: SIZE_APPAREL,
    price: { vnd: 1_290_000, eur: 48 },
  },

  // --------------------------------------------------------------- giày dép
  {
    handle: "giay-cao-got-quai-ngang",
    dj: { category: "womens-shoes", title: "Calvin Klein Heel Shoes" },
    category: "Giày dép",
    title: "Giày cao gót quai ngang",
    subtitle: "Quai thanh mảnh, gót vừa",
    description:
      "Giày cao gót với quai thanh mảnh và độ cao gót vừa phải, dễ phối với đầm và quần âu. Đế chống trượt, đi êm chân.",
    option: SHOE_WOMEN,
    price: { vnd: 1_490_000, eur: 55 },
  },
  {
    handle: "giay-nu-tone-anh-kim",
    dj: { category: "womens-shoes", title: "Golden Shoes Woman" },
    category: "Giày dép",
    title: "Giày nữ tone ánh kim",
    subtitle: "Phần trên ánh kim, lót êm",
    description:
      "Giày nữ tông ánh kim nổi bật, phù hợp đi tiệc và dạo phố. Lót trong êm ái, form chuẩn theo kích cỡ.",
    option: SHOE_WOMEN,
    price: { vnd: 890_000, eur: 33 },
  },
  {
    handle: "giay-the-thao-do-den-cao-co",
    dj: { category: "mens-shoes", title: "Nike Air Jordan 1 Red And Black" },
    category: "Giày dép",
    title: "Giày thể thao đỏ đen cao cổ",
    subtitle: "Dáng cao cổ, đế cao su",
    description:
      "Giày thể thao cao cổ tông đỏ – đen với đế cao su bám tốt. Chất liệu da tổng hợp dễ vệ sinh, hợp phong cách đường phố.",
    option: SHOE_MEN,
    price: { vnd: 3_490_000, eur: 129 },
  },
  {
    handle: "giay-lu-the-thao-retro",
    dj: { category: "mens-shoes", title: "Puma Future Rider Trainers" },
    category: "Giày dép",
    title: "Giày lứ thể thao phong cách retro",
    subtitle: "Đế nhẹ, phom cổ điển",
    description:
      "Giày lứ phom retro với đế nhẹ và lớp lót êm, thoải mái khi đi cả ngày. Dễ phối cùng quần jeans hoặc quần short.",
    option: SHOE_MEN,
    price: { vnd: 1_990_000, eur: 74 },
  },

  // --------------------------------------------------------------- túi xách
  {
    handle: "tui-xach-da-nu-dang-tote",
    dj: { category: "womens-bags", title: "Heshe Women's Leather Bag" },
    category: "Túi xách",
    title: "Túi xách da nữ dáng tote",
    subtitle: "Chất liệu da, ngăn chứa rộng",
    description:
      "Túi tote da dáng rộng với nhiều ngăn, đủ chỗ cho laptop và đồ dùng hàng ngày. Quai đeo chắc chắn, khóa kéo trơn tru.",
    option: { title: "Màu sắc", values: ["Nâu"] },
    price: { vnd: 1_890_000, eur: 70 },
  },
  {
    handle: "tui-xach-nu-dang-hop",
    dj: { category: "womens-bags", title: "Prada Women Bag" },
    category: "Túi xách",
    title: "Túi xách nữ dáng hộp",
    subtitle: "Dáng hộp gọn gàng, quai ngắn",
    description:
      "Túi dáng hộp với phom gọn và quai ngắn cầm tay thanh lịch. Phù hợp đi tiệc cũng như đi làm khi cần set đồ chỉn chu.",
    option: { title: "Màu sắc", values: ["Đen"] },
    price: { vnd: 2_490_000, eur: 92 },
  },
  {
    handle: "ba-lo-da-nhan-tao-trang",
    dj: { category: "womens-bags", title: "White Faux Leather Backpack" },
    category: "Túi xách",
    title: "Ba lô da nhân tạo màu trắng",
    subtitle: "Ngăn laptop, chống thấm nhẹ",
    description:
      "Ba lô màu trắng làm từ da nhân tạo, có ngăn laptop riêng và nhiều ngăn phụ. Chống thấm nhẹ, hợp đi học và đi làm.",
    option: { title: "Màu sắc", values: ["Trắng"] },
    price: { vnd: 990_000, eur: 37 },
  },
  {
    handle: "tui-xach-nu-mau-den",
    dj: { category: "womens-bags", title: "Women Handbag Black" },
    category: "Túi xách",
    title: "Túi xách nữ màu đen",
    subtitle: "Kích cỡ vừa, dây đeo điều chỉnh",
    description:
      "Túi xách nữ màu đen kích cỡ vừa với dây đeo điều chỉnh được độ dài. Thiết kế tối giản, phối được nhiều phong cách.",
    option: { title: "Màu sắc", values: ["Đen"] },
    price: { vnd: 790_000, eur: 29 },
  },

  // -------------------------------------------------------------- phụ kiện
  {
    handle: "kinh-mat-dang-vuong",
    dj: { category: "sunglasses", title: "Sunglasses" },
    category: "Phụ kiện",
    title: "Kính mát dáng vuông",
    subtitle: "Chống UV400, gọng nhựa nhẹ",
    description:
      "Kính mát dáng vuông với tròng chống UV400 và gọng nhựa nhẹ không gây nặng tai. Phù hợp đi biển và dùng hằng ngày.",
    option: { title: "Màu sắc", values: ["Đen"] },
    price: { vnd: 590_000, eur: 22 },
  },
  {
    handle: "dong-ho-day-kim-loai-co-dien",
    dj: { category: "mens-watches", title: "Rolex Datejust" },
    category: "Phụ kiện",
    title: "Đồng hồ dây kim loại cổ điển",
    subtitle: "Mặt số cổ điển, dây kim loại",
    description:
      "Đồng hồ dây kim loại với mặt số cổ điển và độ hoàn thiện bóng bẩy. Chống nước nhẹ, phù hợp đi làm và đi sự kiện.",
    option: { title: "Màu sắc", values: ["Bạc"] },
    price: { vnd: 4_900_000, eur: 180 },
  },
  {
    handle: "bong-tai-pha-le-xanh",
    dj: { category: "womens-jewellery", title: "Green Crystal Earring" },
    category: "Phụ kiện",
    title: "Bông tai pha lê xanh",
    subtitle: "Chất liệu mạ, dáng thanh mảnh",
    description:
      "Bông tai pha lê tông xanh tươi mát với dáng thanh mảnh, nhẹ khi đeo. Món phụ kiện điểm xuyết cho set đồ đơn giản.",
    option: { title: "Màu sắc", values: ["Xanh"] },
    price: { vnd: 390_000, eur: 14 },
  },

  // ------------------------------------------------------------------ quần
  // dummyjson.com sells no trousers, so these five products carry curated
  // CC0 / public-domain photos (Openverse → rawpixel & StockSnap, Wikimedia
  // Commons) instead of a dummyjson gallery. Every URL was checked for a
  // 200 + image/* response before it was added.
  {
    handle: "quan-jeans-nam-thang",
    category: "Quần nam",
    title: "Quần jeans nam ống đứng",
    subtitle: "Denim cotton, phom ống đứng",
    description:
      "Quần jeans nam ống đứng với chất denim cotton dày dặn nhưng vẫn dễ chịu khi mặc. Phom ống đứng tôn dáng, dễ phối cùng áo thun và giày thể thao.",
    images: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Jeans.tif/lossy-page1-1280px-Jeans.tif.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL3B4NzA3MTg0LWltYWdlLWt3dnY2a2IzLmpwZw.jpg",
      "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZnJ6aXBfemlwcGVyX2ZseV9qZWFucy1pbWFnZS1reWJjZGN3Zi5qcGc.jpg",
    ],
    option: { title: "Kích cỡ", values: ["30", "31", "32", "33"] },
    price: { vnd: 790_000, eur: 29 },
  },
  {
    handle: "quan-jeans-nam-wash-vua",
    category: "Quần nam",
    title: "Quần jeans nam wash vừa",
    subtitle: "Wash vừa, cạp thường",
    description:
      "Quần jeans nam wash vừa gam xanh trung tính, không kén phối đồ. Chất denim pha co giãn nhẹ và giữ form tốt sau nhiều lần giặt.",
    images: [
      "https://cdn.stocksnap.io/img-thumbs/960w/QBSVGRFT2Y.jpg",
      "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZnJtYXR0bW9sb25leTAwMDczLWltYWdlLWt3eXNubzY3LmpwZw.jpg",
      "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvbnMyMTc3OS1pbWFnZS1rd3lydWw3ZS5qcGc.jpg",
    ],
    option: { title: "Kích cỡ", values: ["30", "31", "32", "33"] },
    price: { vnd: 850_000, eur: 31 },
  },
  {
    handle: "quan-chino-nam-con",
    category: "Quần nam",
    title: "Quần chino nam ống côn",
    subtitle: "Cotton pha, dáng côn gọn gàng",
    description:
      "Quần chino nam ống côn với chất cotton pha mềm mại và phom ôm vừa vặn. Phù hợp đi làm lẫn đi chơi, phối đẹp với sơ mi và áo polo.",
    images: [
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA2L3Vwd2s2MTc0OTY3NS13aWtpbWVkaWEtaW1hZ2Uta293cXVia2guanBn.jpg",
      "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmw1MDE5MDk4NTAyMS1pbWFnZS1reWJlZnFtcy5qcGc.jpg",
      "https://commons.wikimedia.org/wiki/Special:FilePath/Chino_pants_close-up_-_DSC02850.JPG?width=1280",
    ],
    option: { title: "Kích cỡ", values: ["30", "31", "32", "33"] },
    price: { vnd: 720_000, eur: 27 },
  },
  {
    handle: "quan-ong-rong-nu",
    category: "Quần nữ",
    title: "Quần ống rộng nữ",
    subtitle: "Dáng ống rộng, nhẹ và bay bổng",
    description:
      "Quần ống rộng nữ với phom dáng thoải mái giúp đôi chân luôn thoáng mát. Chất vải mềm rủ nhẹ, hợp đi làm lẫn dạo phố những ngày nắng.",
    images: [
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA3L21pYTk4MDc2LWltYWdlLmpwZw.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA3L21pYTExODA0Ni1pbWFnZS5qcGc.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA3L21pYTI4NDc4LWltYWdlLmpwZw.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA3L21pYTEyMTk1LWltYWdlLmpwZw.jpg",
    ],
    option: { title: "Kích cỡ", values: ["S", "M", "L"] },
    price: { vnd: 690_000, eur: 25 },
  },
  {
    handle: "quan-au-nu-thanh-lich",
    category: "Quần nữ",
    title: "Quần âu nữ thanh lịch",
    subtitle: "Phom ôm, vải đứng form",
    description:
      "Quần âu nữ dáng ôm gọn gàng với chất vải đứng form và ít nhăn. Một lựa chọn thanh lịch cho môi trường công sở lẫn các buổi hẹn.",
    images: [
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTAzL21pYTI0NTM4LWltYWdlLmpwZw.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTAzL21pYTEwNjA0NS1pbWFnZS5qcGc.jpg",
      "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTAzL21pYTU5NDc2LWltYWdlLmpwZw.jpg",
    ],
    option: { title: "Kích cỡ", values: ["S", "M", "L"] },
    price: { vnd: 890_000, eur: 33 },
  },
];

/**
 * Detail attributes rendered on the product page as Chất liệu / Xuất xứ /
 * Loại / Khối lượng / Kích thước. Every catalogue handle needs an entry.
 *
 * origin — ISO 3166-1 alpha-2 code (the storefront expands it with
 *          Intl.DisplayNames, so "vn" reads "Việt Nam" / "Vietnam");
 * weight — grams; dims — [length, width, height] in centimetres;
 * type   — Medusa product type, created on demand and shared across products.
 */
const SPECS = {
  // ------------------------------------------------------------- áo sơ mi
  "ao-so-mi-caro-xanh-den": {
    material: "Cotton pha polyester",
    origin: "vn",
    type: "Áo sơ mi",
    weight: 180,
    dims: [30, 24, 3],
  },
  "ao-so-mi-caro-co-dien": {
    material: "Cotton 65% – Polyester 35%",
    origin: "vn",
    type: "Áo sơ mi",
    weight: 190,
    dims: [30, 24, 3],
  },
  "ao-so-mi-tay-ngan-thanh-lich": {
    material: "Cotton pha spandex",
    origin: "vn",
    type: "Áo sơ mi",
    weight: 165,
    dims: [30, 24, 3],
  },
  "ao-so-mi-ke-song-nam-tinh": {
    material: "Cotton pha viscose",
    origin: "cn",
    type: "Áo sơ mi",
    weight: 175,
    dims: [30, 24, 3],
  },

  // ---------------------------------------------------------- đầm & váy
  "dam-caro-tartan": {
    material: "Polyester pha cotton",
    origin: "vn",
    type: "Đầm nữ dáng xòe",
    weight: 520,
    dims: [32, 26, 6],
  },
  "dam-xam-dang-suon": {
    material: "Polyester pha viscose",
    origin: "vn",
    type: "Đầm nữ dáng suôn",
    weight: 480,
    dims: [32, 26, 6],
  },
  "dam-he-thoang-mat": {
    material: "Cotton pha voan",
    origin: "vn",
    type: "Đầm nữ dáng suôn",
    weight: 380,
    dims: [32, 26, 6],
  },
  "dam-pea-xep-ly": {
    material: "Polyester tái chế",
    origin: "cn",
    type: "Đầm nữ dáng xòe",
    weight: 540,
    dims: [32, 26, 6],
  },
  "dam-da-hoi-den": {
    material: "Lụa pha polyester",
    origin: "vn",
    type: "Đầm dạ hội",
    weight: 780,
    dims: [38, 28, 8],
  },

  // ------------------------------------------------------------ giày dép
  "giay-cao-got-quai-ngang": {
    material: "Da tổng hợp",
    origin: "vn",
    type: "Giày cao gót",
    weight: 620,
    dims: [32, 22, 12],
  },
  "giay-nu-tone-anh-kim": {
    material: "Da tổng hợp ánh kim",
    origin: "cn",
    type: "Giày cao gót",
    weight: 540,
    dims: [30, 20, 11],
  },
  "giay-the-thao-do-den-cao-co": {
    material: "Da tổng hợp & cao su",
    origin: "vn",
    type: "Giày thể thao",
    weight: 880,
    dims: [34, 24, 13],
  },
  "giay-lu-the-thao-retro": {
    material: "Vải mesh & cao su",
    origin: "vn",
    type: "Giày thể thao",
    weight: 760,
    dims: [33, 23, 12],
  },

  // -------------------------------------------------------------- túi xách
  "tui-xach-da-nu-dang-tote": {
    material: "Da bò thật",
    origin: "vn",
    type: "Túi tote",
    weight: 850,
    dims: [42, 32, 14],
  },
  "tui-xach-nu-dang-hop": {
    material: "Da tổng hợp",
    origin: "cn",
    type: "Túi xách tay",
    weight: 620,
    dims: [28, 20, 12],
  },
  "ba-lo-da-nhan-tao-trang": {
    material: "Da nhân tạo",
    origin: "vn",
    type: "Ba lô",
    weight: 780,
    dims: [45, 33, 16],
  },
  "tui-xach-nu-mau-den": {
    material: "Polyester chống nước",
    origin: "vn",
    type: "Túi xách tay",
    weight: 450,
    dims: [34, 26, 10],
  },

  // ------------------------------------------------------------ phụ kiện
  "kinh-mat-dang-vuong": {
    material: "Acetate",
    origin: "vn",
    type: "Kính mát",
    weight: 45,
    dims: [16, 7, 6],
  },
  "dong-ho-day-kim-loai-co-dien": {
    material: "Thép không gỉ",
    origin: "ch",
    type: "Đồng hồ",
    weight: 135,
    dims: [12, 12, 8],
  },
  "bong-tai-pha-le-xanh": {
    material: "Hợp kim mạ & pha lê",
    origin: "th",
    type: "Trang sức",
    weight: 18,
    dims: [10, 8, 4],
  },

  // ------------------------------------------------------------------ quần
  "quan-jeans-nam-thang": {
    material: "Denim cotton 100%",
    origin: "tr",
    type: "Quần jeans",
    weight: 640,
    dims: [36, 28, 6],
  },
  "quan-jeans-nam-wash-vua": {
    material: "Denim cotton pha co giãn",
    origin: "vn",
    type: "Quần jeans",
    weight: 660,
    dims: [36, 28, 6],
  },
  "quan-chino-nam-con": {
    material: "Cotton pha elastane",
    origin: "vn",
    type: "Quần chino",
    weight: 520,
    dims: [36, 28, 5],
  },
  "quan-ong-rong-nu": {
    material: "Linen pha cotton",
    origin: "vn",
    type: "Quần ống rộng",
    weight: 480,
    dims: [38, 30, 6],
  },
  "quan-au-nu-thanh-lich": {
    material: "Polyester pha viscose",
    origin: "vn",
    type: "Quần âu",
    weight: 500,
    dims: [36, 28, 5],
  },
};

const specFor = (handle) => {
  const spec = SPECS[handle];
  if (!spec) throw new Error(`no specs defined for product: ${handle}`);
  return spec;
};

/**
 * The attributes the product page renders. Returns only the keys that are
 * missing or differ, so the sync step can PATCH a single product cheaply and
 * re-runs settle into "nothing to do".
 */
const specPatch = (product, spec, typeId) => {
  const wanted = {
    material: spec.material,
    origin_country: spec.origin,
    weight: spec.weight,
    length: spec.dims[0],
    width: spec.dims[1],
    height: spec.dims[2],
    type_id: typeId,
  };
  const patch = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (value != null && product[key] !== value) patch[key] = value;
  }
  return patch;
};

/** Stock Medusa demo items that are replaced by the catalogue above. */
const SEED_HANDLES = ["t-shirt", "shorts", "sweatshirt", "sweatpants"];

// ------------------------------------------------------------------ requests

let token = "";

const api = async (path, init = {}) => {
  const response = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return response;
};

const apiJson = async (path, init = {}, what = "request") => {
  const response = await api(path, init);
  if (!response.ok) await fail(`${what} failed`, response);
  return response.json();
};

const post = (path, body, what) =>
  apiJson(path, { method: "POST", body: JSON.stringify(body) }, what);

// ---------------------------------------------------------------------- plan

const fetchDummyjson = async () => {
  // Products with a curated `images` list (the trousers) never touch dummyjson.
  const wanted = [
    ...new Set(
      CATALOG.filter((item) => item.dj).map((item) => item.dj.category),
    ),
  ];
  const byCategory = new Map();

  for (const category of wanted) {
    const url = `https://dummyjson.com/products/category/${category}?limit=30`;
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`dummyjson ${category} [${response.status}]`);
    const body = await response.json();
    byCategory.set(
      category,
      new Map((body.products ?? []).map((product) => [product.title, product])),
    );
  }

  return byCategory;
};

const resolveGallery = (item, byCategory) => {
  // Curated galleries (Openverse / Wikimedia photos) skip dummyjson entirely.
  if (item.images?.length) {
    const images = [...new Set(item.images)];
    if (images.length < 2) {
      throw new Error(
        `gallery too small for ${item.handle} (${images.length})`,
      );
    }
    return { images, thumbnail: images[0] };
  }

  const source = byCategory.get(item.dj.category)?.get(item.dj.title);
  if (!source) {
    throw new Error(
      `dummyjson product not found: ${item.dj.category}/${item.dj.title}`,
    );
  }
  const images = [...new Set(source.images ?? [])];
  if (images.length < 2) {
    throw new Error(
      `gallery too small for ${item.dj.title} (${images.length})`,
    );
  }
  return { images, thumbnail: source.thumbnail ?? images[0] };
};

const buildProductPayload = (item, gallery, context) => {
  const { categoryId, salesChannelId, shippingProfileId } = context;
  const { title, values } = item.option;

  return {
    title: item.title,
    subtitle: item.subtitle,
    description: item.description,
    handle: item.handle,
    status: "published",
    thumbnail: gallery.thumbnail,
    images: gallery.images.map((url) => ({ url })),
    categories: [{ id: categoryId }],
    sales_channels: [{ id: salesChannelId }],
    shipping_profile_id: shippingProfileId,
    options: [{ title, values }],
    variants: values.map((optionValue, index) => ({
      title: optionValue,
      sku: `${item.handle}-${optionValue}`
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      variant_rank: index,
      // Demo store: never block a purchase on stock levels.
      manage_inventory: false,
      allow_backorder: true,
      options: { [title]: optionValue },
      prices: [
        { currency_code: "vnd", amount: item.price.vnd },
        { currency_code: "eur", amount: item.price.eur },
      ],
    })),
  };
};

// --------------------------------------------------------------------- main

const main = async () => {
  const startedAt = Date.now();

  // --- auth ---------------------------------------------------------------
  const auth = await post(
    "/auth/user/emailpass",
    { email: EMAIL, password: PASSWORD },
    "admin login",
  );
  if (!auth.token) throw new Error("admin login returned no token");
  token = auth.token;
  log(`authenticated against ${BACKEND}`);

  // --- context ------------------------------------------------------------
  const [
    categoryList,
    productList,
    salesChannels,
    profiles,
    regions,
    productTypes,
  ] = await Promise.all([
    apiJson(
      "/admin/product-categories?limit=100",
      {},
      "listing product categories",
    ),
    apiJson("/admin/products?limit=100", {}, "listing products"),
    apiJson("/admin/sales-channels", {}, "listing sales channels"),
    apiJson("/admin/shipping-profiles", {}, "listing shipping profiles"),
    apiJson("/admin/regions", {}, "listing regions"),
    apiJson("/admin/product-types?limit=100", {}, "listing product types"),
  ]);

  const existingCategories = categoryList.product_categories ?? [];
  const existingProducts = productList.products ?? [];
  const existingTypes = productTypes.product_types ?? [];
  const salesChannel =
    (salesChannels.sales_channels ?? []).find(
      (channel) => !channel.is_disabled,
    ) ?? null;
  const shippingProfile = (profiles.shipping_profiles ?? [])[0] ?? null;
  const vnRegion = (regions.regions ?? []).find(
    (region) => region.currency_code === "vnd",
  );
  const eurRegion = (regions.regions ?? []).find(
    (region) => region.currency_code === "eur",
  );

  if (!salesChannel || !shippingProfile) {
    throw new Error("no usable sales channel or shipping profile found");
  }
  if (!vnRegion) {
    throw new Error(
      "no VND region found — create the Việt Nam region first (see tool header)",
    );
  }

  // --- plan ---------------------------------------------------------------
  // `kind: "exists"` categories are skipped; every other kind mutates.
  const categoryActions = [];
  for (const entry of CATEGORY_PLAN) {
    const target = existingCategories.find((c) => c.handle === entry.handle);
    const source = entry.match
      ? existingCategories.find((c) => c.name === entry.match)
      : null;

    if (target && target.is_active !== false) {
      categoryActions.push({ kind: "exists", entry, id: target.id });
    } else if (target) {
      // Created via API without is_active — the admin defaults it to false,
      // which hides the category from the storefront's category endpoint.
      categoryActions.push({ kind: "activate", entry, id: target.id });
    } else if (source) {
      categoryActions.push({
        kind: "rename",
        entry,
        id: source.id,
        from: source.name,
      });
    } else {
      categoryActions.push({ kind: "create", entry });
    }
  }

  const seedProducts = existingProducts.filter((product) =>
    SEED_HANDLES.includes(product.handle),
  );
  const wantedHandles = ONLY ? [ONLY] : CATALOG.map((item) => item.handle);
  const unknown = wantedHandles.filter(
    (handle) => !CATALOG.some((item) => item.handle === handle),
  );
  if (unknown.length) {
    console.error(`unknown --only handle(s): ${unknown.join(", ")}`);
    process.exit(2);
  }

  const wanted = CATALOG.filter((item) => wantedHandles.includes(item.handle));
  const alreadySeeded = wanted.filter((item) =>
    existingProducts.some((product) => product.handle === item.handle),
  );
  const toCreate = wanted.filter((item) => !alreadySeeded.includes(item));
  const toDelete = KEEP_SEED_PRODUCTS ? [] : seedProducts;

  // --- detail attributes --------------------------------------------------
  // Work out which products still need Chất liệu / Xuất xứ / Loại / Khối
  // lượng / Kích thước, and which product types must exist before they can.
  const typeByValue = new Map(
    existingTypes.map((type) => [type.value, type.id]),
  );
  const pendingSpecs = [];
  for (const item of wanted) {
    const spec = specFor(item.handle);
    const product = existingProducts.find((p) => p.handle === item.handle);
    if (!product) continue; // to be created, attributes patched afterwards
    const typeId = typeByValue.get(spec.type) ?? null;
    if (
      typeId === null ||
      Object.keys(specPatch(product, spec, typeId)).length
    ) {
      pendingSpecs.push(item.handle);
    }
  }
  const missingTypes = [
    ...new Set(wanted.map((item) => specFor(item.handle).type)),
  ].filter((value) => !typeByValue.has(value));

  // --- report -------------------------------------------------------------
  const state = {
    backend: BACKEND,
    salesChannel: salesChannel.id,
    shippingProfile: shippingProfile.id,
    vnRegion: vnRegion.id,
    eurRegion: eurRegion?.id ?? null,
    categories: categoryActions.map((action) => ({
      kind: action.kind,
      name: action.entry.name,
      handle: action.entry.handle,
      from: action.from ?? null,
    })),
    products: {
      existing: existingProducts.length,
      toCreate: toCreate.map((item) => item.handle),
      alreadySeeded: alreadySeeded.map((item) => item.handle),
      seedProductsToDelete: toDelete.map((product) => product.handle),
    },
    attributes: {
      pending: pendingSpecs,
      typesToCreate: missingTypes,
      catalogue: Object.keys(SPECS).length,
    },
    catalogueSize: CATALOG.length,
  };

  if (JSON_OUT && (CHECK || DRY_RUN)) {
    // Dry runs emit only the plan; real runs emit the full summary below.
    console.log(JSON.stringify(state, null, 2));
  } else if (!JSON_OUT) {
    log(
      `catalogue: ${CATALOG.length} products across ${CATEGORY_PLAN.length} categories`,
    );
    for (const action of categoryActions) {
      const detail =
        action.kind === "rename"
          ? `rename "${action.from}" → ${action.entry.name}`
          : action.kind === "create"
            ? `create ${action.entry.name}`
            : action.kind === "activate"
              ? `activate ${action.entry.name}`
              : `exists ${action.entry.name}`;
      log(`  category  ${detail}`);
    }
    log(
      `  products  ${toCreate.length} to create, ${alreadySeeded.length} already present, ` +
        `${toDelete.length} seed product(s) to remove`,
    );
    log(
      `  specs     ${pendingSpecs.length} product(s) need attributes, ` +
        `${missingTypes.length} product type(s) to create`,
    );
  }

  if (CHECK || DRY_RUN) {
    log(CHECK ? "check only — no changes made" : "dry run — no changes made");
    return {
      state,
      created: 0,
      renamed: 0,
      deleted: 0,
      hidden: 0,
    };
  }

  if (
    !toCreate.length &&
    !toDelete.length &&
    !pendingSpecs.length &&
    !missingTypes.length &&
    !categoryActions.some((action) => action.kind !== "exists")
  ) {
    log("nothing to do");
    return {
      state,
      created: 0,
      renamed: 0,
      deleted: 0,
      hidden: 0,
    };
  }

  // --- categories ---------------------------------------------------------
  let renamed = 0;
  for (const action of categoryActions) {
    if (action.kind === "rename") {
      await post(
        `/admin/product-categories/${action.id}`,
        {
          name: action.entry.name,
          handle: action.entry.handle,
          is_active: true,
        },
        `renaming category ${action.entry.name}`,
      );
      renamed += 1;
      log(`  renamed  ${action.from} → ${action.entry.name}`);
    } else if (action.kind === "activate") {
      await post(
        `/admin/product-categories/${action.id}`,
        {
          name: action.entry.name,
          handle: action.entry.handle,
          is_active: true,
        },
        `activating category ${action.entry.name}`,
      );
      renamed += 1;
      log(`  active   ${action.entry.name}`);
    } else if (action.kind === "create") {
      await post(
        "/admin/product-categories",
        {
          name: action.entry.name,
          handle: action.entry.handle,
          is_active: true,
        },
        `creating category ${action.entry.name}`,
      );
      renamed += 1;
      log(`  created  ${action.entry.name}`);
    }
  }

  // Refresh after mutation so new ids are available.
  const refreshedCategories = await apiJson(
    "/admin/product-categories?limit=100",
    {},
    "relisting product categories",
  );
  const categoryByName = new Map(
    (refreshedCategories.product_categories ?? []).map((c) => [c.name, c]),
  );

  // --- product types -------------------------------------------------------
  // Product types feed the "Loại" attribute — create whatever the catalogue
  // needs so a fresh backend ends up with the same set as a re-run.
  for (const value of missingTypes) {
    const createdType = await post(
      "/admin/product-types",
      { value },
      `creating product type ${value}`,
    );
    const typeId = createdType.product_type?.id;
    if (!typeId) {
      throw new Error(`unexpected product type response for "${value}"`);
    }
    typeByValue.set(value, typeId);
    log(`  type     created ${value}`);
  }

  // --- galleries ----------------------------------------------------------
  const dummyjson = await fetchDummyjson();

  // --- products -----------------------------------------------------------
  let created = 0;
  for (const item of toCreate) {
    const category = categoryByName.get(item.category);
    if (!category) {
      throw new Error(`category missing after sync: ${item.category}`);
    }

    const gallery = resolveGallery(item, dummyjson);
    const payload = buildProductPayload(item, gallery, {
      categoryId: category.id,
      salesChannelId: salesChannel.id,
      shippingProfileId: shippingProfile.id,
    });

    const result = await post(
      "/admin/products",
      payload,
      `creating ${item.handle}`,
    );
    created += 1;
    log(
      `  created  ${item.title} (${gallery.images.length} ảnh, ${item.option.values.length} biến thể, ` +
        `${item.price.vnd.toLocaleString("vi-VN")}₫)`,
    );
    if (!result.product?.id) {
      throw new Error(`unexpected create response for ${item.handle}`);
    }
  }

  // --- remove stock seed products ----------------------------------------
  let deleted = 0;
  let hidden = 0;
  for (const product of toDelete) {
    const response = await api(`/admin/products/${product.id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      deleted += 1;
      log(`  deleted  ${product.title} (${product.handle})`);
      continue;
    }

    // Medusa refuses to hard-delete a product whose inventory still carries
    // reservations (an earlier order holds them). Reverting to draft removes
    // it from the storefront without touching that order's data.
    const reason = (await response.text()).slice(0, 140);
    await post(
      `/admin/products/${product.id}`,
      { status: "draft" },
      `drafting ${product.handle}`,
    );
    hidden += 1;
    log(
      `  hidden   ${product.title} (${product.handle}) — delete blocked, set to draft (${reason})`,
    );
  }

  // --- detail attributes ---------------------------------------------------
  // Chất liệu / Xuất xứ / Loại / Khối lượng / Kích thước for every catalogue
  // product: re-list first (the twenty older ones already exist), then PATCH
  // only the values that differ. Also covers freshly created products, which
  // are written without attributes so both paths share this one code path.
  const refreshedProducts = await apiJson(
    "/admin/products?limit=100",
    {},
    "relisting products for attribute sync",
  );
  let specsSynced = 0;
  for (const item of wanted) {
    const spec = specFor(item.handle);
    const product = (refreshedProducts.products ?? []).find(
      (p) => p.handle === item.handle,
    );
    if (!product) {
      log(`  warning  ${item.handle} missing after create — specs skipped`);
      continue;
    }
    const patch = specPatch(product, spec, typeByValue.get(spec.type) ?? null);
    if (!Object.keys(patch).length) continue;

    await post(
      `/admin/products/${product.id}`,
      patch,
      `updating attributes for ${item.handle}`,
    );
    specsSynced += 1;
    log(
      `  specs    ${item.title} — ${spec.material}, ` +
        `${spec.origin.toUpperCase()}, ${spec.type}, ${spec.weight} g, ` +
        `${spec.dims.join(" × ")} cm`,
    );
  }

  // --- verify -------------------------------------------------------------
  const verify = await apiJson(
    "/admin/products?limit=100&status[]=published",
    {},
    "verifying products",
  );
  const published = verify.products ?? [];

  let storeCheck = { count: null, sample: [] };
  try {
    const storeProducts = await apiJson(
      `/store/products?region_id=${vnRegion.id}&limit=4&fields=title,handle,thumbnail,variants.calculated_price`,
      {
        headers: {
          "x-publishable-api-key":
            process.env.MEDUSA_PUBLISHABLE_KEY ??
            "pk_a697fef63cb95dfa4811f6638493953bda3a1ffdc248d94ed32470736dbf0633",
        },
      },
      "verifying store prices (VND)",
    );
    storeCheck = {
      count: storeProducts.count ?? null,
      sample: (storeProducts.products ?? []).map((product) => ({
        title: product.title,
        price:
          product.variants?.[0]?.calculated_price?.calculated_amount ?? null,
      })),
    };
  } catch (error) {
    log(`  warning  store verification failed: ${error.message}`);
  }

  const summary = {
    state,
    created,
    renamed,
    deleted,
    hidden,
    specsSynced,
    publishedCount: published.length,
    storeCheck,
    durationMs: Date.now() - startedAt,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    log(
      `done: ${created} created, ${specsSynced} attribute set(s) synced, ` +
        `${renamed} categories synced, ${deleted} deleted + ${hidden} set to ` +
        `draft — ${published.length} published products in ` +
        `${summary.durationMs}ms`,
    );
    if (storeCheck.count !== null) {
      log(
        `store (VND): ${storeCheck.count} products; sample ` +
          storeCheck.sample.map((p) => `${p.title}=${p.price}`).join(", "),
      );
    }
  }

  return summary;
};

main().catch((error) => {
  console.error(`seed failed: ${error.message}`);
  process.exitCode = 1;
});
