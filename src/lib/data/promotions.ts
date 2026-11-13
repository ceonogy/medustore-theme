import { sdk } from "@lib/sdk";

/**
 * The storefront's view of `GET /store/promotions`: price lists that are
 * marked active *and* inside their time window, each reduced to the products
 * its prices apply to. The slug is derived from the price list title on the
 * backend, so Medusa stays the single source of `/khuyen-mai/{slug}`.
 */
export type Promotion = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string | null;
  ends_at: string | null;
  product_ids: string[];
};

const TTL_MS = 60_000;

let cache: { promotions: Promotion[]; loadedAt: number } | null = null;
let inflight: Promise<Promotion[]> | null = null;

/**
 * Every live promotion, cached for a minute like the taxonomy: the lookup
 * runs on every `/khuyen-mai` render — including the 404 of an unknown slug —
 * so it must not become a per-request hop to Medusa.
 *
 * A backend failure propagates: the pages turn it into the same 503 +
 * Retry-After answer a taxonomy outage gets.
 */
export const listPromotions = async (): Promise<Promotion[]> => {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.promotions;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { promotions } = await sdk.client.fetch<{
        promotions: Promotion[];
      }>("/store/promotions");
      const value = Array.isArray(promotions) ? promotions : [];
      cache = { promotions: value, loadedAt: Date.now() };
      return value;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

/** The promotion a `/khuyen-mai/{slug}` URL addresses, if one is live. */
export const findPromotion = async (
  slug: string,
): Promise<Promotion | null> => {
  const promotions = await listPromotions();
  return promotions.find((promotion) => promotion.slug === slug) ?? null;
};
