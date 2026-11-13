import { defineConfig } from "astro/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const { PUBLIC_MEDUSA_BACKEND_URL, S3_DOMAIN } = loadEnv(
  process.env.NODE_ENV ?? "",
  process.cwd(),
  "",
);

/**
 * Optional addons (`medusavn-goship`, `medusavn-sepay`).
 *
 * `src/lib/addons/enabled.ts` imports them statically so the slot registry has
 * a stable shape. When a package is not installed, alias its `storefront`
 * entry to a local stub that exports `undefined` — uninstalling an addon is
 * then just `yarn remove <pkg>` plus removing its backend plugin/provider
 * entries, with no source edits in the theme.
 */
const require = createRequire(import.meta.url);

const hasAddon = (id) => {
  try {
    require.resolve(`${id}/package.json`);
    return true;
  } catch {
    return false;
  }
};

const addonStub = (name) =>
  fileURLToPath(
    new URL(`./src/lib/addons/stub-${name}.ts`, import.meta.url),
  );

const addonAlias = {};
if (!hasAddon("medusavn-goship")) {
  addonAlias["medusavn-goship/storefront"] = addonStub("goship");
}
if (!hasAddon("medusavn-sepay")) {
  addonAlias["medusavn-sepay/storefront"] = addonStub("sepay");
}

const medusaBackendDomain = PUBLIC_MEDUSA_BACKEND_URL
  ? new URL(PUBLIC_MEDUSA_BACKEND_URL).hostname
  : undefined;

// https://astro.build/config
export default defineConfig({
  site: "https://demostore.ceonogy.com",
  // Canonical URLs never carry a trailing slash — the middleware 301s any
  // `/page/` request onto `/page`, so the two never compete for one content.
  trailingSlash: "never",
  // Astro 7 flipped the default to compressHTML: 'jsx', which strips the
  // whitespace between adjacent inline elements (`<span>a</span>
  // <span>b</span>` → "ab"). v6's HTML-aware compression preserved that
  // space, and the Framer-derived markup relies on it — keep the old
  // behaviour so nothing in the design loses its spacing.
  compressHTML: true,
  adapter: node({
    mode: "standalone",
  }),
  // https://docs.astro.build/en/guides/internationalization/
  // Vietnamese-first: the default locale is served from the domain root with
  // no `/vi/` prefix. `en` is listed so switching locales back on is a single
  // env change — while PUBLIC_I18N_ENABLED is off (the default) the middleware
  // 301s every `/en/…` URL to its prefix-less twin and the nav shows no
  // language switcher, so the site behaves as a single-language store.
  i18n: {
    locales: ["vi", "en"],
    defaultLocale: "vi",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [react()],
  output: "server",
  server: {
    port: 3001,
    host: "127.0.0.1",
  },
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
      // Empty when both addons are installed; points the missing one at a
      // local stub so the theme builds without it. See top of this file.
      alias: addonAlias,
    },
    plugins: [tailwindcss()],
    ssr: {
      // @medusajs/js-sdk ships ESM with directory imports that Node cannot
      // resolve, so bundle it instead of externalizing it.
      noExternal: ["@medusajs/js-sdk"],
    },
  },
  image: {
    domains: [
      "medusa-public-images.s3.eu-west-1.amazonaws.com",
      ...(medusaBackendDomain ? [medusaBackendDomain] : []),
      ...(S3_DOMAIN ? [S3_DOMAIN] : []),
    ],
  },
});
