/**
 * Build-time stub for the optional SePay addon.
 *
 * `astro.config.mjs` aliases `medusavn-sepay/storefront` here when the package
 * is not installed, so `enabled.ts` can keep a static import and the theme
 * still builds — the slot simply resolves to `undefined`.
 */
export const sepay = undefined;
