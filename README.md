# Astro Medusa Storefront

A blazing-fast, open-source ecommerce storefront built with **Astro**, **React**, and **Medusa v2** — server-rendered on Node behind OpenLiteSpeed.

Server-rendered with edge-cache headers. Interactive where it matters. Zero compromise on performance.

> **Full setup guide:** [INSTALL.md](./INSTALL.md) — storefront env, Medusa backend,
> optional GoShip/SePay addons, deploy and verification.

## Tech Stack

| Layer      | Technology                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Framework  | [Astro 7](https://astro.build) — server-rendered HTML, islands of interactivity                        |
| UI         | [React 19](https://react.dev) — only where you need it                                                 |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com) — zero-config Vite plugin                                   |
| Backend    | [Medusa v2](https://medusajs.com) — headless commerce engine                                           |
| Payments   | [Stripe](https://stripe.com) + optional `medusavn-sepay` (bank transfer / VietQR)                      |
| State      | [Nanostores](https://github.com/nanostores/nanostores) — tiny, framework-agnostic stores               |
| Forms      | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) validation                     |
| Deployment | [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/) — PM2 behind OpenLiteSpeed |

## Architecture

```
┌─────────────────────────────────────────────────┐
│         VPS · OpenLiteSpeed → Node (PM2)         │
│                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│   │   SSR    │  │  Astro   │  │    React     │  │
│   │ + edge   │──│Middleware│──│   Islands    │  │
│   │  cache   │  │ (Region) │  │ (Cart, Nav)  │  │
│   └──────────┘  └──────────┘  └──────┬───────┘  │
│                                       │         │
└───────────────────────────────────────┼─────────┘
                                        │
                              ┌─────────▼─────────┐
                              │   Medusa v2 API   │
                              │  (Your backend)   │
                              └─────────┬─────────┘
                                        │
                              ┌─────────▼─────────┐
                              │      Stripe       │
                              └───────────────────┘
```

**SSR with edge caching, live data:**

- Catalog, product, and promotion pages render server-side (Node adapter) and are edge-cached (`public, s-maxage=60, stale-while-revalidate`), so prices and stock stay fresh with no rebuilds
- Every URL follows an SEO contract — `trailingSlash: "never"` (301 from middleware), flat category/collection paths, canonical query strings, and an explicit redirect/404/status policy
- Product variant availability is refreshed client-side to prevent stale inventory data
- Cart, checkout, and navigation hydrate as interactive React islands
- Middleware handles region detection and country-based routing
- Cart state persists client-side via Nanostores + `localStorage`

## Pages

| Route                           | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `/`                             | Landing page (Vietnamese, default locale)        |
| `/store`                        | Product catalog (filters, facets, price slider)  |
| `/store/:handle`                | Product detail (2-column, image carousel)        |
| `/:category`, `/:parent/:child` | Flat category pages (e.g. `/giay-dep`)           |
| `/bo-suu-tap/:handle`           | Collection pages                                 |
| `/khuyen-mai`                   | Active promotions index                          |
| `/khuyen-mai/:slug`             | Promotion detail (scoped filters)                |
| `/cart`                         | Shopping cart                                    |
| `/checkout`                     | Multi-step checkout (address, shipping, payment) |
| `/order/confirmed`              | Order confirmation                               |
| `/privacy`, `/terms`            | Static legal pages                               |
| `/robots.txt`, `/sitemap.xml`   | SEO endpoints (dynamic routes)                   |

The default locale (Vietnamese) is served from the domain root with **no** locale
prefix. Other locales are prefixed, e.g. `/en/store`. See
[Internationalization](#internationalization-i18n). Trailing slashes, wrong case,
and non-canonical query strings 301-redirect to the canonical URL
(`src/middleware.ts` + `src/lib/utils/canonical-query.ts`).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Yarn](https://yarnpkg.com) 4.x
- A running [Medusa v2](https://docs.medusajs.com) backend
- [Stripe](https://stripe.com) account (for payments)

### Setup

```bash
# Clone the repo
git clone https://github.com/ceonogy/medustore-theme.git
cd medustore-theme/

# Install dependencies
yarn

# Configure environment
cp .env.example .env
```

Fill in your `.env`:

```env
PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
DEFAULT_REGION=vi
PUBLIC_STRIPE_KEY=pk_test_...
S3_DOMAIN=your-bucket.s3.us-east-1.amazonaws.com
PUBLIC_INPOST_GEOWIDGET_TOKEN=your-token
PUBLIC_INPOST_SANDBOX=true
```

> Make sure your Medusa backend has [CORS configured](https://docs.medusajs.com/learn/configurations/medusa-config#httpstorecors) to allow requests from your storefront origin.

### Development

```bash
yarn dev        # Start dev server on localhost:3001
```

### Production

```bash
yarn build      # Production build (Node adapter → dist/)
yarn preview    # Preview the production build locally
```

### Backups

The PostgreSQL database is the store's only durable state (product
images are external URLs), so `scripts/db-backup.sh` dumps it nightly
into `/home/backups/medusa/` — custom format, mode 600, 14-day
retention, a `.counts` sidecar per dump and a copy of the backend
`.env` so a dump can land on a fresh host with its secrets.
`scripts/db-backup-verify.sh` is the drill: it restores the newest dump
into a throwaway database and diffs row counts table by table. Cron is
host-level (not in git):

```bash
45 2 * * *  /home/storefront/scripts/db-backup.sh        >> /home/backups/medusa/backup.log  2>&1
0  3 * * *  /home/storefront/scripts/db-backup-verify.sh >> /home/backups/medusa/verify.log  2>&1
```

`scripts/watchdog.sh` (every 5 min, same log convention) probes the
storefront and the Medusa API; after 15 minutes down it restarts the
affected app via pm2 (hourly cooldown prevents restart storms) and it
alerts when a dump is missing/stale or the restore drill failed. Healthy
runs are silent; set `WATCHDOG_ALERT_URL` to pipe alerts into a
Slack/Discord/ntfy webhook.

### Backend (Medusa) modules

The storefront repo also carries the **deployable backend source** under
[`backend/`](./backend/README.md) — the Brevo notification provider, subscribers
and workflows, the search/promotion APIs, and the conditional registration of
the two optional addons. It is a mirror of
`/home/medusa/apps/backend`, not a standalone project; secrets and runtime data
(`.env`, `node_modules/`, `.medusa/`, `static/`) stay out of git.

GoShip and SePay live in their own repositories (see
[Optional Addons](#optional-addons-goship--sepay)) and are pulled in as
dependencies, so this repo stays free of integration-specific code.

Deploy it with the script at the repo root:

```bash
./deploy.sh               # rsync backend/ → /home/medusa/apps/backend, yarn build, pm2 restart medusa
./deploy.sh --dry-run     # show the rsync changes without applying them
./deploy.sh --no-build    # sync + restart only
```

`deploy.sh` protects `.env`, uploads and build caches from `rsync --delete`, so
only code/config changes are applied. See [`backend/README.md`](./backend/README.md)
for the module map, required env vars, the optional-addon setup and the
Brevo/SePay self-tests.

## Project Structure

```
src/
├── assets/              # Static assets (images, fonts)
├── i18n/                # Translation dictionaries (vi = source of truth)
├── layouts/             # Page layout (head, canonical/OG tags, JSON-LD)
├── lib/
│   ├── addons/          # Optional addon slot registry (GoShip, SePay)
│   ├── data/            # Server data layer: catalog, promotions (+ tests)
│   ├── sdk.ts           # Medusa SDK singleton
│   ├── stores/          # Nanostores (cart state)
│   └── utils/           # URL/SEO/catalog helpers (unit-tested)
├── middleware.ts         # URL contract, region detection, cache matrix
├── modules/
│   ├── cart/            # Cart page & sidebar
│   ├── checkout/        # Multi-step checkout flow
│   ├── layout/          # Nav, footer, JSON-LD
│   ├── order/           # Order confirmation
│   └── products/        # Product cards, detail, filters, carousel
├── pages/
│   └── [...locale]/     # All routes; default locale is prefix-less
│       ├── store/       # Catalog + /store/:handle detail
│       ├── khuyen-mai/  # Promotion index + /khuyen-mai/:slug
│       ├── bo-suu-tap/  # Collections (/bo-suu-tap/:handle)
│       └── [category]/  # Flat categories (/:category, /:parent/:child)
├── styles/              # Global styles & Tailwind theme
└── types/               # TypeScript type definitions

Top-level routes also include `src/pages/robots.txt.ts` and
`src/pages/sitemap.xml.ts` (dynamic SEO endpoints).
```

## Key Design Decisions

- **Islands architecture** — React only loads for interactive components (cart, nav, checkout). Everything else ships as zero-JS server-rendered HTML.
- **Real-time inventory checks** — Product variant stock data is fetched client-side on page load, ensuring accurate availability alongside server-rendered pages.
- **Self-hosted SSR** — the Node adapter runs under PM2 behind OpenLiteSpeed; catalog responses carry `s-maxage` edge-cache headers (with `Vary: Cookie` for regional pricing), while cart, checkout, and orders stay `no-store`.
- **Tailwind v4** — No config file. Theme customization lives in CSS with `@theme`. Powered by the Vite plugin.
- **Region-aware routing** — The market (country) drives pricing, currency, and available shipping options via Medusa regions. It is resolved from the `country` cookie / `DEFAULT_REGION` instead of the URL, so the locale prefix can stay clean.
- **SEO URL contract** — `trailingSlash: "never"`, flat category/collection paths, canonical query strings, and an explicit redirect/404/status policy, enforced in `src/middleware.ts` with helpers from `src/lib/utils/canonical-query.ts`.

## Optional Addons (GoShip & SePay)

Shipping (GoShip) and bank-transfer payments (SePay) are **not part of the
theme**. They ship as two independent Medusa v2 packages that can be installed
and removed separately — see their READMEs for the full backend + storefront
guide:

- [`medusavn-goship`](https://github.com/ceonogy/medusavn-goship) · [install guide](https://github.com/ceonogy/medusavn-goship/blob/main/INSTALL.md)
- [`medusavn-sepay`](https://github.com/ceonogy/medusavn-sepay) · [install guide](https://github.com/ceonogy/medusavn-sepay/blob/main/INSTALL.md)

### How the theme consumes them

The theme never imports addon internals. It reads a slot registry:

```ts
// src/lib/addons/index.ts
import { addons, addonClientConfig } from "@lib/addons";

addons.goship?.AddressFields   // checkout province → district → ward cascade
addons.goship?.getUnits        // g/kg + cm/m labels on product pages
addons.sepay?.PaymentPanel     // QR/VA panel on the confirmation page
```

| Slot | Used in | Fallback when the addon is absent |
| --- | --- | --- |
| `addons.goship.AddressFields` | `src/modules/checkout/components/AddressFields.tsx` | three plain text inputs |
| `addons.goship.getUnits` | `src/pages/[...locale]/store/[handle].astro` | `{ weightUnit: "g", dimensionUnit: "cm" }` |
| `addons.sepay.PaymentPanel` | `src/modules/order/components/ConfirmedFallbackPage.tsx` | renders nothing |

`src/lib/addons/enabled.ts` is the only file that names the packages. It keeps
static imports so types stay exact, and `astro.config.mjs` aliases a **missing**
package to `src/lib/addons/stub-*.ts` (which exports `undefined`). That makes
uninstalling a real one-liner:

```bash
yarn remove medusavn-goship
# then remove its plugin/provider entries in backend/medusa-config.ts and redeploy
```

The build still succeeds, the slots resolve to `undefined`, and every caller
falls back as shown above. The backend behaves the same way: `medusa-config.ts`
guards each addon with `require.resolve`, so Medusa falls back to manual
fulfillment / `pp_system_default`.

### Adding an addon to another theme

Each addon README documents the three integration points: the backend plugin +
provider entries, the env vars + migration, and the storefront component with
its props (`value`/`onChange`, `orderId`, `labels`, `formatAmount`,
`renderSelect`). Nothing in the components depends on Astro or this design
system — they are plain controlled React components, so they drop into Next.js,
Remix, or a Vite SPA unchanged.

## Internationalization (i18n)

Vietnamese-first, following [Astro's i18n routing guide](https://docs.astro.build/en/guides/internationalization/):

```js
// astro.config.mjs
i18n: {
  locales: ["vi", "en"],
  defaultLocale: "vi",
  routing: { prefixDefaultLocale: false }, // `/store`, not `/vi/store`
}
```

- **Dictionaries** live in `src/i18n/dictionaries/*.ts`, split per area (`core`,
  `cart`, `checkout`, `order`, `products`) so edits do not collide. `vi` is the
  source of truth for keys; `en` is typed as `typeof vi`, so a missing key is a
  compile error.
- **Usage**

  ```ts
  import { localizePath, useTranslations } from "@i18n";

  const t = useTranslations(Astro.locals.locale);
  t("cart.empty"); // "Giỏ hàng của bạn đang trống"
  t("nav.cartCount", { count: 3 }); // interpolation
  localizePath("en", "/store"); // "/en/store"
  localizePath("vi", "/store"); // "/store"
  ```

- **`src/middleware.ts`** resolves the locale from the URL, redirects legacy
  market URLs (`/dk/store` → `/store`), 404s unknown first segments, and injects
  `Astro.locals.locale` + `Astro.locals.countryCode`.
- **Language switcher** — `Nav` renders VI/EN links for the current page.

### Admin (backend) Vietnamese

The Medusa Admin is patched separately via `tools/admin-vi-i18n/` — see its
[README](./tools/admin-vi-i18n/README.md).

## License

[MIT](LICENSE)

## Author

**Michal Bystryk** — [digity.studio](https://digity.studio/) · [LinkedIn](https://www.linkedin.com/in/michal-bystryk/)

## Work with me

Need a custom storefront, a Medusa integration, or help shipping an ecommerce project?
I build them at **[digity.studio](https://digity.studio/)** — get in touch.
