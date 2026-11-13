/**
 * Build-time stub for the optional GoShip addon.
 *
 * `astro.config.mjs` aliases `medusavn-goship/storefront` here when the package
 * is not installed, so `enabled.ts` can keep a static import and the theme
 * still builds — the slot simply resolves to `undefined`.
 */
export const goship = undefined;
