/**
 * Addon slot registry — the only place a theme names its optional addons.
 *
 * Both packages are optional. `astro.config.mjs` aliases a missing package's
 * `storefront` entry to `stub-goship.ts` / `stub-sepay.ts` (which export
 * `undefined`), so:
 *
 *   uninstall = `yarn remove medusavn-goship`
 *             + remove its plugin/provider lines in backend/medusa-config.ts
 *
 * No edits are needed here. The slots stay typed and simply resolve to
 * `undefined`, which every consumer already handles with a fallback.
 */
import { goship } from "medusavn-goship/storefront";
import { sepay } from "medusavn-sepay/storefront";
import type { AddonRegistry } from "./types";

const enabled: AddonRegistry = {
  goship,
  sepay,
};

export default enabled;
