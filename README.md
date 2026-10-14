# Astro Medusa Storefront

A blazing-fast, open-source ecommerce storefront built with **Astro**, **React**, and **Medusa v2** — server-rendered on Node behind OpenLiteSpeed.

Server-rendered with edge-cache headers. Interactive where it matters. Zero compromise on performance.

## Tech Stack

| Layer      | Technology                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Framework  | [Astro 6](https://astro.build) — server-rendered HTML, islands of interactivity                        |
| UI         | [React 19](https://react.dev) — only where you need it                                                 |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com) — zero-config Vite plugin                                   |
| Backend    | [Medusa v2](https://medusajs.com) — headless commerce engine                                           |
| Payments   | [Stripe](https://stripe.com) — secure checkout                                                         |
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

## Project Structure

```
src/
├── assets/              # Static assets (images, fonts)
├── i18n/                # Translation dictionaries (vi = source of truth)
├── layouts/             # Page layout (head, canonical/OG tags, JSON-LD)
├── lib/
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
