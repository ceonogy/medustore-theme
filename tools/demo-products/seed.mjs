#!/usr/bin/env node
/**
 * Seeds the Demo Store catalogue: five Vietnamese categories and twenty
 * fashion products with multi-image galleries sourced from dummyjson.com,
 * priced in VND (Việt Nam region) and EUR (Europe region).
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
];

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
  const wanted = [...new Set(CATALOG.map((item) => item.dj.category))];
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
  const [categoryList, productList, salesChannels, profiles, regions] =
    await Promise.all([
      apiJson(
        "/admin/product-categories?limit=100",
        {},
        "listing product categories",
      ),
      apiJson("/admin/products?limit=100", {}, "listing products"),
      apiJson("/admin/sales-channels", {}, "listing sales channels"),
      apiJson("/admin/shipping-profiles", {}, "listing shipping profiles"),
      apiJson("/admin/regions", {}, "listing regions"),
    ]);

  const existingCategories = categoryList.product_categories ?? [];
  const existingProducts = productList.products ?? [];
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
    catalogueSize: CATALOG.length,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(state, null, 2));
  } else {
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
    publishedCount: published.length,
    storeCheck,
    durationMs: Date.now() - startedAt,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    log(
      `done: ${created} created, ${renamed} categories synced, ` +
        `${deleted} deleted + ${hidden} set to draft — ${published.length} published ` +
        `products in ${summary.durationMs}ms`,
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
