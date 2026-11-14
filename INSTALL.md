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

### Setup script (half-automatic)

`scripts/setup.mjs` connects the storefront to a **running** Medusa backend,
writes `.env`, builds the site and verifies a deployed domain. It never invents
data — anything that needs a human decision (DNS, TLS, admin user, shipping
options) is printed as a next step instead.

```bash
node scripts/setup.mjs                      # interactive (prompts for backend + key)
node scripts/setup.mjs \
  --backend-url https://adminstore.example.com \
  --publishable-key pk_... --region vn --yes # unattended
node scripts/setup.mjs --verify-only --site-url https://storefront.example.com
```

| Flag | Meaning |
| --- | --- |
| `--backend-url <url>` | Medusa origin, no trailing slash (`PUBLIC_MEDUSA_BACKEND_URL`) |
| `--publishable-key <key>` | `pk_…` linked to the sales channel |
| `--region <iso2>` | `DEFAULT_REGION`; validated against `/store/regions` |
| `--site-url <url>` | also verify a deployed storefront |
| `--admin-email` / `--admin-password` | optional Admin API login, used in memory only, to list keys and regions |
| `--env-path <file>` | target env file (default `./.env`). **Do not use `--env-file`** — Node 22 consumes that flag itself |
| `--skip-install` / `--skip-build` | skip `yarn install` / `yarn build` |
| `--verify-only` | run every check, write nothing |
| `--yes` / `--force` | accept defaults / write `.env` even when a check failed |

What it **does** automatically:

1. Node ≥ 20 and Yarn present.
2. `GET <backend>/health` must answer 200.
3. The publishable key is validated with `GET /store/regions` — a 400/401 means
   the key is wrong or not linked to the sales channel, and the script refuses
   to write `.env` (so a working file is never replaced by a broken one).
4. Optional Admin API login lists real keys and regions, so you can pick from a
   menu instead of copying values by hand.
5. `DEFAULT_REGION` is validated against the regions the key can see and
   defaults to `vn`.
6. `.env` is written with mode `600`, keeping comments and unknown variables.
7. `yarn install` + `yarn build` (unless skipped).
8. Checks `dist/server/entry.mjs`, then with `--site-url`: `/`, `/store`,
   `/checkout`, the same-origin `/medusa` proxy and the two optional addon
   routes.
9. Prints the reverse-proxy and CORS checklist. Exit code `0` = all hard checks
   passed, `1` = something needs attention.

What stays **manual** (by design):

| Step | Why |
| --- | --- |
| Admin user, region, sales channel, publishable key | one-time backend bootstrap; passwords must not pass through a script's argv |
| DNS records + TLS certificate | needs registrar/DNS access |
| Web-server vhost (OLS/Nginx) | see §4; host paths and ports differ per machine |
| `STORE_CORS` / `ADMIN_CORS` / `AUTH_CORS` in the backend | belongs to the backend `.env`, then `pm2 restart medusa` |
| `pm2 start` + `pm2 save`, log rotation | process supervision is host-specific |
| Addon install, migrations, `goship-sync`, webhooks | see each addon's `INSTALL.md` |

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

## 4. Domains, TLS & reverse proxy

Two hostnames is the layout this theme is built and tested against:

| Hostname | Proxies to | Serves |
| --- | --- | --- |
| `storefront.example.com` | `127.0.0.1:3001` | the Astro storefront **and** `/medusa/*` |
| `adminstore.example.com` | `127.0.0.1:9000` | Medusa Admin (`/app`), `/store`, `/admin`, `/webhooks`, `/static` |

They can live on one hostname (e.g. `/medusa` proxied to the backend by Astro
and `/app` by the web server), but two hostnames avoid path collisions and let
you move the backend without touching the storefront.

Rules that matter:

- **Do not add a `/medusa` rule to the web server.** Astro's middleware
  (`src/middleware.ts`) already proxies `/medusa/store/*` → `<backend>/store/*`.
  A second proxy hop would strip `x-publishable-api-key` and break checkout.
- `PUBLIC_MEDUSA_BACKEND_URL` must be the backend **origin** (scheme + host, no
  trailing slash, no `/store`). SSR calls it directly; the browser only ever
  talks to the storefront origin.
- The web server must pass `X-Forwarded-Proto: https` and keep the original
  `Host`, so Astro emits correct canonical URLs and secure cookies.
- Uploads are served by the backend at `https://adminstore.example.com/static/*`.
  If product images 404, `MEDUSA_BACKEND_URL` is wrong (see §2).

### CORS (backend `.env`)

Exact origins, no trailing slash, scheme must match the browser address bar:

```dotenv
STORE_CORS=https://storefront.example.com
ADMIN_CORS=https://adminstore.example.com
AUTH_CORS=https://adminstore.example.com
```

Add `,https://www.storefront.example.com` only if you actually serve the `www`
host (or redirect it — a redirect makes CORS irrelevant). For local
development append `,http://localhost:3001,http://localhost:5173`. After
changing these values: `pm2 restart medusa`.

Symptom of a mismatch: the storefront renders (SSR works) but every browser
interaction — add to cart, checkout, login — fails with a CORS error in the
console. `curl` never reproduces it because curl does not enforce CORS.

### OpenLiteSpeed (CyberPanel)

`/usr/local/lsws/conf/vhosts/storefront.example.com/vhost.conf`:

```apache
docRoot                   $VH_ROOT/public_html
vhDomain                  $VH_NAME
vhAliases                 www.$VH_NAME
enableGzip                1

extprocessor storefrontproxy {
  type                    proxy
  address                 127.0.0.1:3001
  maxConns                100
  pcKeepAliveTimeout      60
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

rewrite  {
  enable                  1
  rules                   <<<END_rules
RewriteCond %{SERVER_PORT} 80
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
RewriteRule (^|/)\.env - [F,L]
RewriteRule (^|/)\.git(/|$) - [F,L]
  END_rules
}

context / {
  type                    proxy
  uri                     /
  handler                 storefrontproxy
  addDefaultCharset       off
  extraHeaders            <<<END_extraHeaders
  RequestHeader set X-Forwarded-Proto https
  END_extraHeaders
}

vhssl  {
  keyFile                 /etc/letsencrypt/live/storefront.example.com/privkey.pem
  certFile                /etc/letsencrypt/live/storefront.example.com/fullchain.pem
  certChain               1
  sslProtocol             24
  enableECDHE             1
  enableStapling          1
}
```

Repeat with `adminstoreproxy` → `127.0.0.1:9000` for the backend host, then
`systemctl restart lsws`. Create the vhost in CyberPanel (or
`/usr/local/lsws/conf/httpd_config.conf` → `virtualHost` + `map`) so the
listener maps the domain.

### Nginx

```nginx
server {
  listen 80;
  server_name storefront.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name storefront.example.com;

  ssl_certificate     /etc/letsencrypt/live/storefront.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/storefront.example.com/privkey.pem;

  client_max_body_size 10m;

  location / {
    proxy_pass         http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";
    proxy_read_timeout 120s;
  }
}

# adminstore.example.com — same block, proxy_pass http://127.0.0.1:9000;
```

Do not buffer off `/medusa` and do not rewrite the body: webhook routes need
the **raw** body for HMAC verification (the addons set `preserveRawBody`, but a
proxy that re-encodes JSON breaks the signature).

### TLS

```bash
certbot certonly --webroot -w /usr/local/lsws/Example/html \
  -d storefront.example.com -d www.storefront.example.com
certbot certonly --webroot -w /usr/local/lsws/Example/html \
  -d adminstore.example.com
systemctl list-timers | grep certbot      # auto-renew must be active
```

`certbot renew --dry-run` once after setup. OLS needs `systemctl reload lsws`
after a renewal; Nginx reloads itself via the certbot hook.

### Same-host alternative

If both apps share one hostname, keep the Astro proxy for `/medusa` and route
the admin app separately, e.g. `location /app { proxy_pass http://127.0.0.1:9000; }`
plus `/admin`, `/auth`, `/webhooks`, `/static`, `/store`, `/health`. This works
but the CORS lists then contain a single origin, and a typo in one `location`
breaks checkout — two hostnames are less fragile.

---

## 5. Deployment order

Do these in order; each step has a checkpoint so a failure is caught before the
next one builds on it.

| # | Step | Command / action | Checkpoint |
| --- | --- | --- | --- |
| 1 | DNS + TLS | A/AAAA records for both hostnames, `certbot certonly` | `curl -I https://adminstore.example.com` answers (even 404) with a valid cert |
| 2 | PostgreSQL + Redis | create DB/user, `DATABASE_URL`, optional `REDIS_URL` | `psql "$DATABASE_URL" -c 'select 1'` |
| 3 | Backend code + env | copy `backend/` (§2), fill `.env` | `yarn build` succeeds |
| 4 | Migrations + first boot | `npx medusa db:migrate`, `pm2 start medusa` | `curl http://127.0.0.1:9000/health` → 200 |
| 5 | Admin bootstrap | `npx medusa user -e admin@example.com -p '…'`; in `/app`: region (Vietnam, VND), sales channel, publishable key linked to it | `curl -H "x-publishable-api-key: pk_…" .../store/regions` → 200 with your region |
| 6 | Catalog | create products, set prices for the VND region, stock location, flat-rate shipping options | store API returns products for the key |
| 7 | Optional addons | install package → `db:migrate` → addon env → `goship-sync` / enable SePay per region → webhooks | addon routes answer, checkout shows the extra options |
| 8 | Storefront | `git clone`, `yarn install`, `node scripts/setup.mjs --backend-url … --publishable-key … --region vn` | script exits 0 and wrote `.env` |
| 9 | Build + pm2 | `yarn build`, `pm2 start ecosystem.config.cjs`, `pm2 save` | `curl http://127.0.0.1:3001/` → 200 |
| 10 | Reverse proxy + CORS | vhosts (§4), then `STORE_CORS`/`ADMIN_CORS`/`AUTH_CORS`, `pm2 restart medusa` | `node scripts/setup.mjs --verify-only --site-url https://storefront.example.com` → exit 0 |
| 11 | End-to-end | add to cart → address with GoShip codes → shipping options → pay → confirmation page | order appears in Admin with the right total and fulfillment |
| 12 | Operations | `scripts/db-backup.sh`, `scripts/db-backup-verify.sh`, `scripts/watchdog.sh` in cron | one manual run of each, logs empty of errors |

Notes:

- **5 before 8.** The setup script validates the publishable key against
  `/store/regions`; without a region and a linked key it stops (by design).
- **7 before 8** only if you want the addons on the first deploy. Otherwise
  install them later — the storefront falls back to manual fulfillment and
  `pp_system_default`, and the slot registry means no source edit is needed.
- **10 last.** Proxy and CORS are the only steps that can make a *working*
  stack look broken (SSR renders, browser calls fail), so verify them with the
  script rather than by clicking around.
- Re-deploying code later: `./deploy.sh` (backend) and
  `yarn build && pm2 restart storefront` (storefront). Run
  `node scripts/setup.mjs --verify-only --site-url …` afterwards.

---

## 6. Verify the installation

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

## 7. Troubleshooting

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
