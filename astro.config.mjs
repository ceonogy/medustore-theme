import { defineConfig } from "astro/config";
import { loadEnv } from "vite";

import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

const { PUBLIC_MEDUSA_BACKEND_URL, S3_DOMAIN } = loadEnv(
  process.env.NODE_ENV ?? "",
  process.cwd(),
  "",
);

const medusaBackendDomain = PUBLIC_MEDUSA_BACKEND_URL
  ? new URL(PUBLIC_MEDUSA_BACKEND_URL).hostname
  : undefined;

// https://astro.build/config
export default defineConfig({
  site: "https://demostore.ceonogy.com",
  adapter: node({
    mode: "standalone",
  }),
  // https://docs.astro.build/en/guides/internationalization/
  // Vietnamese-first: the default locale is served from the domain root with
  // no `/vi/` prefix, every other locale is prefixed (e.g. `/en/store`).
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
