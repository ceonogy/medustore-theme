# demo-products

Seeds the storefront catalogue: **7 Vietnamese categories** and **25 fashion
products**, each with a multi-image gallery, priced in **VND** (Việt Nam region)
and **EUR** (Europe region), with Vietnamese titles, subtitles and
descriptions. Every product also carries the five detail attributes the product
page renders — **Chất liệu**, **Xuất xứ**, **Loại**, **Khối lượng**,
**Kích thước**.

Twenty products take their gallery from [dummyjson.com]; the five trousers
products use CC0 / public-domain photographs from Openverse and Wikimedia
Commons instead, because dummyjson stocks no pants.

[dummyjson.com]: https://dummyjson.com/

```bash
MEDUSA_ADMIN_EMAIL=… MEDUSA_ADMIN_PASSWORD=… \
  node tools/demo-products/seed.mjs --check   # read-only plan
node tools/demo-products/seed.mjs             # apply
```

Credentials are never defaulted so they cannot end up in this (public) repo.

## What it does

| Step          | Detail                                                                                                                                                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories    | Renames the four stock categories to `Áo sơ mi`, `Đầm & Váy`, `Giày dép`, `Phụ kiện` (keeps their ids) and creates `Túi xách`, `Quần nam`, `Quần nữ`. Ensures `is_active`, which the admin API otherwise defaults to `false` — hiding the category from the storefront. |
| Products      | Creates the 25 products with size/colour options (3–4 variants each), `manage_inventory: false` + `allow_backorder: true` so a demo purchase never blocks on stock, and links them to the default sales channel and shipping profile.                                   |
| Product types | Creates the Medusa product types the catalogue needs (`Áo sơ mi`, `Đầm nữ dáng xòe`, `Quần jeans`, …) and stores each id as the product's `type_id` — its value is what the detail page shows as **Loại**.                                                              |
| Attributes    | Patches `material`, `origin_country` (ISO 3166-1 alpha-2 — expanded in the browser with `Intl.DisplayNames`), `weight` (grams), `length` / `width` / `height` (centimetres) and `type_id` from the `SPECS` table, **only for values that are missing or differ**.       |
| Stock seeds   | Deletes the four Medusa demo products. If a delete is refused (an existing order still holds inventory reservations) the product is reverted to `draft` instead, so it leaves the storefront without touching that order.                                               |
| Verification  | Re-lists published products and queries the store API for the VND region, printing a price sample.                                                                                                                                                                      |

The run is **idempotent**: categories already in place are skipped, existing
products are never recreated and the attribute patch sends only what changed —
so a first run backfills the whole catalogue and a second run reports
`nothing to do`. Safe to re-run after editing the catalogue.

### Flags

`--backend <url>` (default `http://127.0.0.1:9000`) · `--only <handle>` ·
`--keep-seed-products` · `--check` · `--dry-run` · `--json` · `--quiet`
(`--password`/`--email` mirror the env vars).

## One-time backend prerequisites

Already applied on this deployment; recreate them elsewhere like this.

```bash
TOKEN=$(curl -sX POST "$BACKEND/auth/user/emailpass" -H 'Content-Type: application/json' \
  -H 'x-medusa-actor-type: user' -d '{"email":"…","password":"…"}' | jq -r .token)

# 1. a VND region
curl -sX POST "$BACKEND/admin/regions" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Việt Nam","currency_code":"vnd","countries":["vn"]}'

# 2. make the shipping zone serve Vietnam + price the options in VND
curl -sX POST "$BACKEND/admin/fulfillment-sets/<fuset>/service-zones/<zone>" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"geo_zones":[{"type":"country","country_code":"vn"}]}'   # keep existing countries too

curl -sX POST "$BACKEND/admin/shipping-options/<so>" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Giao hàng tiêu chuẩn","prices":[{"currency_code":"eur","amount":10},{"currency_code":"vnd","amount":30000}]}'
```

> **`prices` replaces, it does not merge** — always send every currency the
> store sells in.

Then point the storefront at the market: `DEFAULT_REGION=vn` in
`/home/storefront/.env`, `yarn build && pm2 restart storefront`.

## Images

Two sources, both free of rights and used here for a demo store:

- **dummyjson.com** — the `images` array of each product (typically four angles
  of the same item), referenced from the CDN. See the licensing note in the
  repository root before shipping them anywhere but a demo.
- **Trousers (`Quần nam`, `Quần nữ`)** — curated CC0 / public-domain
  photographs found through [Openverse](https://openverse.org/): rawpixel and
  StockSnap files (`images.rawpixel.com`, `cdn.stocksnap.io`) plus Wikimedia
  Commons originals. Commons files are resolved through
  `Special:FilePath/<file>?width=1280`, which redirects to a scaled thumbnail —
  the direct `/thumb/…` path for the JPEG-in-TIFF sources 404s.

  Every URL was checked for `200` + `image/*` with a browser `User-Agent` and a
  `Referer` from the storefront origin, and no photo is reused across products.
