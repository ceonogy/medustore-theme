/// <reference types="astro/client" />

/**
 * Values injected by `src/middleware.ts` before any page renders.
 */
declare namespace App {
  interface Locals {
    /** Active locale, resolved from the URL prefix (default: `vi`). */
    locale: "vi" | "en";
    /** Market/country used for region + currency resolution (no longer in the URL). */
    countryCode: string;
  }
}
