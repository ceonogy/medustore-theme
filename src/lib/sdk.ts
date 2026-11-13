import Medusa from "@medusajs/js-sdk";

// In the browser every store call goes through the storefront's
// same-origin `/medusa` proxy (see src/middleware.ts): a cross-origin
// call to the backend dies on CORS preflight, because Medusa's
// publishable-key guard answers OPTIONS with 400 before any CORS
// middleware runs. SSR talks to the backend URL directly.
const MEDUSA_BACKEND_URL =
  typeof window === "undefined"
    ? import.meta.env.PUBLIC_MEDUSA_BACKEND_URL
    : `${window.location.origin}/medusa`;

const MEDUSA_PUBLISHABLE_KEY = import.meta.env.PUBLIC_MEDUSA_PUBLISHABLE_KEY;

const isDevEnvironment = import.meta.env.DEV;

if (!MEDUSA_BACKEND_URL) {
  console.warn("PUBLIC_MEDUSA_BACKEND_URL environment variable is not set.");
}

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  publishableKey: MEDUSA_PUBLISHABLE_KEY,
  debug: isDevEnvironment,
});
