#!/usr/bin/env node
/**
 * Seeds the demo store's sale campaigns (`price_list` records of type `sale`)
 * that power `/khuyen-mai` and the countdown on product pages.
 *
 * Two campaigns are created on a fresh catalogue:
 *
 *   • Flash Sale Cuối Tuần — 20% off four selected products, ends in ~5 days
 *   • Ưu Đãi Tháng 11       — 25% off four other products, ends in ~40 days
 *
 * The deadline is computed from the run date (not hard-coded) so a demo
 * always has a live campaign. Re-running is safe and idempotent: a campaign
 * whose title already exists is reported and skipped, never recreated.
 * Nothing is deleted and no other price list is touched.
 *
 * Usage:
 *   MEDUSA_ADMIN_EMAIL=admin@example.com MEDUSA_ADMIN_PASSWORD=secret \
 *     node tools/demo-promotions/seed.mjs [options]
 *
 * Options:
 *   --backend <url>   Medusa backend (default http://127.0.0.1:9000)
 *   --email <addr>    admin login (or MEDUSA_ADMIN_EMAIL)
 *   --password <pw>   admin password (or MEDUSA_ADMIN_PASSWORD)
 *   --check           report current state, change nothing
 *   --dry-run         print the planned campaigns, change nothing
 *   --json            machine-readable output
 *   --quiet           suppress progress lines
 *
 * Exit codes: 0 success · 1 request failed · 2 usage error
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

// ----------------------------------------------------------------- campaigns

const DAY_MS = 86_400_000;

const CAMPAIGNS = [
  {
    title: "Flash Sale Cuối Tuần",
    description: "Giảm 20% cho các món được chọn — chỉ trong vài ngày.",
    discount: 0.2,
    endsInDays: 5,
    handles: [
      "ao-so-mi-caro-co-dien",
      "dam-caro-tartan",
      "quan-jeans-nam-thang",
      "tui-xach-nu-mau-den",
    ],
  },
  {
    title: "Ưu Đãi Tháng 11",
    description: "Giảm 25% cho túi xách, đầm và trang phục công sở.",
    discount: 0.25,
    endsInDays: 40,
    handles: [
      "ba-lo-da-nhan-tao-trang",
      "dam-da-hoi-den",
      "quan-au-nu-thanh-lich",
      "tui-xach-da-nu-dang-tote",
    ],
  },
];

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

const fail = async (what, response) => {
  const body = await response.text().catch(() => "");
  throw new Error(
    `${what} failed [${response.status}${response.statusText ? ` ${response.statusText}` : ""}] ${body.slice(0, 400)}`,
  );
};

const apiJson = async (path, init = {}, what = "request") => {
  const response = await api(path, init);
  if (!response.ok) await fail(what, response);
  return response.json();
};

const post = (path, body, what) =>
  apiJson(path, { method: "POST", body: JSON.stringify(body) }, what);

// --------------------------------------------------------------------- plan

/** Product handle → variants with their base VND price (undoing the discount). */
const resolveProducts = async (handles) => {
  const resolved = [];
  for (const handle of handles) {
    const body = await apiJson(
      `/admin/products?handle=${encodeURIComponent(handle)}` +
        "&fields=id,handle,title,*variants,*variants.prices",
      {},
      `loading product ${handle}`,
    );
    const product = body.products?.[0];
    if (!product) throw new Error(`product not found: ${handle}`);

    const variants = (product.variants ?? []).map((variant) => {
      const vnd = (variant.prices ?? []).find(
        (price) => price.currency_code === "vnd",
      );
      if (!vnd) {
        throw new Error(`product ${handle} has no VND price on ${variant.id}`);
      }
      return { variant_id: variant.id, baseAmount: vnd.amount };
    });

    if (!variants.length) {
      throw new Error(`product ${handle} has no variants to discount`);
    }
    resolved.push({ handle, title: product.title, variants });
  }
  return resolved;
};

const buildPlans = async () => {
  const plans = [];
  for (const campaign of CAMPAIGNS) {
    const products = await resolveProducts(campaign.handles);
    const startsAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endsAt = new Date(
      Date.now() + campaign.endsInDays * DAY_MS,
    ).toISOString();

    const prices = products.flatMap((product) =>
      product.variants.map((variant) => ({
        amount: Math.round(variant.baseAmount * (1 - campaign.discount)),
        currency_code: "vnd",
        variant_id: variant.variant_id,
      })),
    );

    plans.push({
      title: campaign.title,
      description: campaign.description,
      starts_at: startsAt,
      ends_at: endsAt,
      products: products.map((product) => product.title),
      prices,
    });
  }
  return plans;
};

// --------------------------------------------------------------------- main

const existingPriceLists = async () => {
  const body = await apiJson(
    "/admin/price-lists?limit=100",
    {},
    "listing price lists",
  );
  return new Map((body.price_lists ?? []).map((list) => [list.title, list]));
};

const main = async () => {
  const startedAt = Date.now();

  const auth = await post(
    "/auth/user/emailpass",
    { email: EMAIL, password: PASSWORD },
    "admin login",
  );
  if (!auth.token) throw new Error("admin login returned no token");
  token = auth.token;
  log(`authenticated against ${BACKEND}`);

  const plans = await buildPlans();
  const existing = await existingPriceLists();

  const report = [];
  for (const plan of plans) {
    const current = existing.get(plan.title);
    const summary = {
      title: plan.title,
      status: current
        ? "exists"
        : CHECK || DRY_RUN
          ? "would-create"
          : "created",
      ends_at: plan.ends_at,
      products: plan.products,
      price_count: plan.prices.length,
      id: current?.id ?? null,
    };

    if (current) {
      // A price list can exist with no prices if an earlier create partly
      // failed. Refill it rather than leaving a dead campaign on the page.
      const detail = await apiJson(
        `/admin/price-lists/${current.id}?fields=*prices`,
        {},
        `loading price list "${plan.title}"`,
      );
      const priceCount = detail.price_list?.prices?.length ?? 0;
      if (priceCount === 0 && !CHECK && !DRY_RUN) {
        await post(
          `/admin/price-lists/${current.id}/prices/batch`,
          { create: plan.prices },
          `refilling prices for "${plan.title}"`,
        );
        summary.status = "repaired";
        summary.price_count = plan.prices.length;
        log(
          `repaired "${plan.title}" (${current.id}) — added ` +
            `${plan.prices.length} prices`,
        );
        report.push(summary);
        continue;
      }

      log(
        `skip "${plan.title}" — already exists (${current.id}, ` +
          `${priceCount} prices)`,
      );
      report.push(summary);
      continue;
    }

    if (CHECK || DRY_RUN) {
      log(
        `would create "${plan.title}" — ${plan.products.length} products, ` +
          `ends ${plan.ends_at.slice(0, 10)}`,
      );
      report.push(summary);
      continue;
    }

    const created = await post(
      "/admin/price-lists",
      {
        title: plan.title,
        description: plan.description,
        type: "sale",
        status: "active",
        starts_at: plan.starts_at,
        ends_at: plan.ends_at,
      },
      `creating price list "${plan.title}"`,
    );
    const id = created.price_list?.id;
    if (!id) throw new Error(`creating "${plan.title}" returned no id`);

    await post(
      `/admin/price-lists/${id}/prices/batch`,
      { create: plan.prices },
      `adding prices to "${plan.title}"`,
    );

    summary.status = "created";
    summary.id = id;
    log(
      `created "${plan.title}" (${id}) — ${plan.prices.length} prices, ` +
        `ends ${plan.ends_at.slice(0, 10)}`,
    );
    report.push(summary);
  }

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          backend: BACKEND,
          check: CHECK,
          dry_run: DRY_RUN,
          campaigns: report,
          duration_ms: Date.now() - startedAt,
        },
        null,
        2,
      ),
    );
  } else if (!QUIET) {
    const created = report.filter((item) => item.status === "created").length;
    const skipped = report.filter((item) => item.status === "exists").length;
    console.log(
      `\nDone — ${created} created, ${skipped} already existed, ` +
        `${report.length} campaign(s) checked.`,
    );
  }
};

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
