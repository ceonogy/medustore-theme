# Installation Guide — ZStore storefront + Medusa backend

This repository contains two things:

| Path | What it is |
| --- | --- |
| `/` (root) | Astro 7 storefront (SSR, React islands, Vietnamese-first) |
| `backend/` | Mirror of the deployable files of a Medusa v2 backend (`apps/backend`) |

GoShip and SePay are **not** in this repo. They are optional addon packages:

- [`medusavn-goship`](https://github.com/ceonogy/medusavn-goship) — shipping
- [`medusavn-sepay`](https://github.com/ceonogy/medusavn-sepay) — bank transfer

The storefront and backend both run fine without them (manual fulfillment +
`pp_system_default`), so you can install one, both, or neither.

---

## 0. Requirements

| Component | Version |
| --- | --- |
| Node.js | 20 or 22 LTS |
| Yarn | 4.9.1 (`corepack enable`) |
| PostgreSQL | 15+ |
| Medusa | 2.21.x |
| Redis | optional (recommended in production) |
| PM2 | production process manager |
| Reverse proxy | OpenLiteSpeed / Nginx (TLS termination) |

---

## 1. Storefront

```bash
git clone https://github.com/ceonogy/medustore-theme.git
cd medustore-theme

corepack enable
yarn install

cp .env.example .env
# edit .env — see the table below

yarn dev            # http://127.0.0.1:3001
```

### Environment (`/.env`)

| Variable | Required | Notes |
| --- | --- | --- |
| `PUBLIC_MEDUSA_BACKEND_URL` | yes | Backend origin, e.g. `https://adminstore.example.com`. No trailing slash. |
| `PUBLIC_MEDUSA_PUBLISHABLE_KEY` | yes | Publishable API key linked to the sales channel (`pk_…`). |
| `DEFAULT_REGION` | recommended | ISO-2 country used when no `country` cookie is set, e.g. `vn`. |
| `S3_DOMAIN` | optional | Image host added to Astro's `image.domains`. |
| `PUBLIC_STRIPE_KEY` | optional | Only when the Stripe provider is enabled. |
| `PUBLIC_I18N_ENABLED` | optional | `false` (default) = Vietnamese-only, `/en/*` 301s to the prefix-less URL. |
| `PUBLIC_INPOST_GEOWIDGET_TOKEN` | optional | Only for the InPost integration. |

Browser calls go through the storefront's same-origin `/medusa` proxy
(`src/middleware.ts`), which forwards `x-publishable-api-key` to the backend.
That is why the backend CORS lists only the storefront/admin origins — the
browser never calls Medusa directly.

### Build & run

```bash
yarn build
NODE_ENV=production node ./dist/server/entry.mjs   # listens on 127.0.0.1:3001
```

With PM2:

```bash
pm2 start ecosystem.config.cjs      # app name: storefront
pm2 save
```

Point the reverse proxy at `127.0.0.1:3001` and keep `/medusa/*` on the same
origin (the proxy is handled by Astro middleware, not by the web server).

### Tests

```bash
yarn test        # 117 unit tests (node:test, no extra deps)
```

---

## 2. Backend (Medusa v2)

`backend/` is a **mirror**, not a standalone project. Use it in one of two ways.

### Option A — existing Medusa project (recommended)

```bash
# 1. copy the custom files into your Medusa app
rsync -a --exclude '.env*' --exclude 'node_modules' \
  backend/ /path/to/medusa/apps/backend/

# 2. merge backend/medusa-config.ts with your own config
#    (keep your DB/CORS settings, take the modules/providers/plugins blocks)

# 3. install + migrate
cd /path/to/medusa
yarn install
cd apps/backend && npx medusa db:migrate

# 4. build + start
cd /path/to/medusa && yarn build
cd apps/backend && npx medusa start
```

### Option B — the `deploy.sh` workflow used in production

```bash
./deploy.sh               # rsync backend/ → $MEDUSA_ROOT/apps/backend, build, pm2 restart medusa
./deploy.sh --dry-run     # show the rsync plan only
./deploy.sh --no-build    # sync + restart (no build)
./deploy.sh --no-restart  # sync + build (no restart)
```

| Variable | Default |
| --- | --- |
| `MEDUSA_ROOT` | `/home/medusa` |
| `MEDUSA_BACKEND_DIR` | `$MEDUSA_ROOT/apps/backend` |
| `PM2_APP` | `medusa` |
| `HEALTH_URL` | `http://127.0.0.1:9000/health` |

Never overwritten by `rsync --delete`: `.env*`, `node_modules`, `.medusa`,
`.turbo`, `dist`, `build`, `.cache`, `static`, `uploads`.

> `yarn build` does **not** install dependencies. After changing
> `package.json` (adding/removing an addon) run `cd $MEDUSA_ROOT && yarn install`
> before deploying.

### Environment (`apps/backend/.env`)

Start from `backend/.env.template`, then add the provider keys you use:

```dotenv
DATABASE_URL=postgres://user:pass@localhost:5432/medusa_store
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
COOKIE_SECRET=...
STORE_CORS=https://storefront.example.com
ADMIN_CORS=https://adminstore.example.com
AUTH_CORS=https://adminstore.example.com
MEDUSA_BACKEND_URL=https://adminstore.example.com

# Brevo (transactional email — always used by this theme)
BREVO_API_KEY=...
BREVO_FROM=no-reply@example.com
BREVO_FROM_NAME=Example Store
BREVO_STORE_URL=https://storefront.example.com
```

GoShip/SePay variables are only needed when the matching addon is installed —
see their `INSTALL.md`.

### Image uploads

`medusa-config.ts` points the local file provider at
`<backend>/static` and rewrites it to a symlink so `medusa build` (which wipes
`.medusa/server`) never deletes uploads. Keep that block, or switch to S3.

### Admin in Vietnamese (optional)

```bash
node tools/admin-vi-i18n/patch-vi.mjs --config tools/admin-vi-i18n/config.json
```

See [`tools/admin-vi-i18n/README.md`](./tools/admin-vi-i18n/README.md) for the
default-language patch and `--no-default-vi`.

---

## 3. Optional addons

Install in the **Medusa workspace**, not inside `apps/backend`:

```bash
cd /path/to/medusa
yarn add medusavn-goship medusavn-sepay
yarn install
```

`backend/medusa-config.ts` already registers them **conditionally** with
`require.resolve`, so no config edit is needed:

```ts
const hasPackage = (id: string) => {
  try { require.resolve(`${id}/package.json`, { paths: [__dirname] }); return true }
  catch { return false }
}
```

Then follow each addon's guide for env vars, migrations, provisioning and
webhook setup:

- GoShip → [`medusavn-goship/INSTALL.md`](https://github.com/ceonogy/medusavn-goship/blob/main/INSTALL.md)
- SePay → [`medusavn-sepay/INSTALL.md`](https://github.com/ceonogy/medusavn-sepay/blob/main/INSTALL.md)

After installing, run migrations and rebuild:

```bash
cd apps/backend && npx medusa db:migrate
cd /path/to/medusa && yarn build
pm2 restart medusa
```

### Storefront side

```bash
cd medustore-theme
yarn add medusavn-goship medusavn-sepay
yarn install && yarn build
```

`src/lib/addons/enabled.ts` imports both packages and exposes them as slots
(`addons.goship?.AddressFields`, `addons.sepay?.PaymentPanel`). When a package
is missing, `astro.config.mjs` aliases the import to
`src/lib/addons/stub-*.ts`, so **uninstalling needs no source edit**:

```bash
yarn remove medusavn-goship
# also remove its plugin/provider/env from the Medusa workspace, then redeploy
```

---

## 4. Verify the installation

```bash
BACKEND=https://adminstore.example.com
STORE=https://storefront.example.com
KEY=pk_...                                  # PUBLIC_MEDUSA_PUBLISHABLE_KEY

# backend health
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND/health"            # 200

# addon routes (only when installed)
curl -s -H "x-publishable-api-key: $KEY" "$STORE/medusa/store/goship/config"
curl -s -H "x-publishable-api-key: $KEY" "$STORE/medusa/store/goship/locations" | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' -H "x-publishable-api-key: $KEY" \
  "$STORE/medusa/store/sepay/order/nope"                              # 404

# guards
curl -s -o /dev/null -w '%{http_code}\n' "$STORE/medusa/store/goship/config"   # 400
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND/admin/goship/config"        # 401

# storefront pages
for p in / /store /checkout /order/confirmed; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "$STORE$p"
done
```

End-to-end shipping check (create a cart, set a Vietnamese address with GoShip
codes, then list options — expect 2 manual + 2 GoShip):

```bash
curl -s -H "x-publishable-api-key: $KEY" "$STORE/medusa/store/shipping-options?cart_id=cart_..."
```

If GoShip is enabled but both options cost `GOSHIP_FALLBACK_FEE`, the address is
missing `goship_city_code` / `goship_district_code` / `goship_ward_code` in its
metadata — see the GoShip guide.

---

## 5. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `400 Publishable API key required` | `PUBLIC_MEDUSA_PUBLISHABLE_KEY` missing/empty, or the key is not linked to the sales channel. |
| Browser requests fail with CORS | You are calling the backend directly. Keep `PUBLIC_MEDUSA_BACKEND_URL` on the same origin and let `/medusa` proxy handle it. |
| Checkout shows only 2 shipping options | GoShip addon not installed, disabled in Admin → GoShip, or no `calculated` option attached to the cart's stock location. |
| Both GoShip options show the fallback fee | Address metadata lacks the GoShip codes (the addon only quotes real rates with codes). |
| Confirmation page has no bank-transfer block | SePay addon not installed, order has no `pp_sepay` session, or the panel got no `orderId`. |
| `/admin/goship/config` returns 401 in a browser | Expected without an admin session; log in at `/app`. |
| `medusa build` fails after removing an addon | Remove its plugin/provider lines and run `yarn install`; `require.resolve` guards only work when the package is truly gone. |
| Uploaded images 404 after deploy | The `static` symlink block in `medusa-config.ts` was removed, or `MEDUSA_BACKEND_URL` points to the wrong origin. |
