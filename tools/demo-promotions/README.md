# demo-promotions

Seeds the **sale campaigns** that power `/khuyen-mai` and the product-page
countdown: Medusa `price_list` records of type `sale`, with a start/end window
and per-variant VND prices at a discount.

Two campaigns are created:

| Campaign             | Discount | Ends     | Products                                                                                     |
| -------------------- | -------- | -------- | -------------------------------------------------------------------------------------------- |
| Flash Sale Cuối Tuần | 20%      | ~5 days  | Áo sơ mi caro cổ điển, Đầm caro Tartan, Quần jeans nam ống đứng, Túi xách nữ màu đen         |
| Ưu Đãi Tháng 11      | 25%      | ~40 days | Ba lô da nhân tạo màu trắng, Đầm dạ hội đen, Quần âu nữ thanh lịch, Túi xách da nữ dáng tote |

Deadlines are computed from the run date, so a fresh demo always has a live
campaign to render. Prices are derived from each variant's **base VND price**,
so the script works on any catalogue with the same handles.

```bash
MEDUSA_ADMIN_EMAIL=… MEDUSA_ADMIN_PASSWORD=… \
  node tools/demo-promotions/seed.mjs --check   # read-only plan
node tools/demo-promotions/seed.mjs             # apply
```

Credentials are never defaulted so they cannot end up in this (public) repo.

## Idempotent

A campaign whose **title** already exists is reported (`exists`) and skipped —
its dates are never overwritten. If an existing campaign somehow has **no
prices** (a partly failed earlier run), the script refills them and reports
`repaired`. Nothing is deleted, and no other price list is touched. To change
a live campaign, edit it in the Medusa admin (Pricing → Price lists).

## Flags

`--backend <url>` (default `http://127.0.0.1:9000`) · `--check` · `--dry-run` ·
`--json` · `--quiet` (`--password`/`--email` mirror the env vars).

## How it talks to Medusa

1. `POST /auth/user/emailpass` → admin token.
2. `GET /admin/price-lists?limit=100` → existing titles.
3. `GET /admin/products?handle=…&fields=*variants,*variants.prices` → variant
   ids and base VND prices.
4. `POST /admin/price-lists` → the campaign (type `sale`, status `active`).
5. `POST /admin/price-lists/{id}/prices/batch` → `{ create: [...] }` with one
   price per variant.

> The storefront caches `GET /store/promotions` for 60 seconds, so a newly
> seeded campaign appears within a minute (or after a storefront restart).
