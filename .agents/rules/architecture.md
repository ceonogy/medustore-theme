# Architecture & Constraints

## Rendering Model
- Astro renders every route server-side (`output: "server"`, Node adapter); catalog responses are edge-cached by `src/middleware.ts` (`public, s-maxage=60` + `Vary: Cookie`), while cart/checkout/order responses are `no-store`
- React is used only for interactive islands: Nav, CartSidebar, ProductActions, ImageCarousel, CartPage
- Cart state lives entirely client-side via Nanostores + localStorage

## URL Contract
- All routes live under `src/pages/[...locale]/`; the Vietnamese default locale has **no** URL prefix (other locales are prefixed, e.g. `/en/store`)
- Flat SEO paths: `/:category`, `/:parent/:child`, `/store/:handle`, `/bo-suu-tap/:handle`, `/khuyen-mai/:slug`
- `src/middleware.ts` redirects trailing slashes, wrong case, and non-canonical query strings to the canonical URL, resolves the locale from the path, and maps the `country` cookie to Medusa regions (cached 1 hour)
- Pure URL/query helpers live in `src/lib/utils/canonical-query.ts` and are unit-tested via `yarn test`

## Key Constraints
- **Tailwind CSS v4**: No `tailwind.config.js` — configuration via `@theme` in CSS
- **Node runtime** (adapter: `@astrojs/node`): Node APIs are available, but keep URL/query logic pure and unit-testable
- The Medusa SDK is force-bundled for SSR via `vite.ssr.noExternal`
