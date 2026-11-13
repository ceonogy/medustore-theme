import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { slugify } from "./slug";

type PriceListRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
};

type PriceRow = {
  price_set?: {
    variant?: {
      product_id?: string | null;
    } | null;
  } | null;
};

type ProductRow = { id: string };

export type PromotionPayload = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string | Date | null;
  ends_at: string | Date | null;
  product_ids: string[];
};

/**
 * `GET /store/promotions` — the storefront's `/khuyen-mai` pages read their
 * data from here: every price list that is marked active *and* inside its
 * time window (once the window closes the list stops changing prices, so its
 * page must stop existing in the same breath — the two would disagree).
 *
 * Each promotion carries the products its prices apply to, reduced to the
 * ones the store actually sells: a price list may point at drafts, and the
 * storefront renders only from its published catalogue.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "price_list",
    fields: ["id", "title", "description", "type", "starts_at", "ends_at"],
    filters: { status: "active" },
  });
  const priceLists = data as PriceListRow[];

  const now = Date.now();
  const live = priceLists.filter((list) => {
    const starts = list.starts_at ? Date.parse(String(list.starts_at)) : null;
    const ends = list.ends_at ? Date.parse(String(list.ends_at)) : null;
    return (starts === null || starts <= now) && (ends === null || ends >= now);
  });

  const promotions: PromotionPayload[] = [];

  if (live.length) {
    const { data: publishedData } = await query.graph({
      entity: "product",
      fields: ["id"],
      filters: { status: "published" },
    });
    const publishedIds = new Set(
      (publishedData as ProductRow[]).map((product) => product.id),
    );

    for (const list of live) {
      const { data: priceData } = await query.graph({
        entity: "price",
        fields: ["price_set.variant.product_id"],
        filters: { price_list_id: list.id },
      });

      const productIds = [
        ...new Set(
          (priceData as PriceRow[])
            .map((price) => price.price_set?.variant?.product_id ?? null)
            .filter((id): id is string => Boolean(id)),
        ),
      ].filter((id) => publishedIds.has(id));

      promotions.push({
        id: list.id,
        slug: slugify(list.title) || list.id,
        title: list.title,
        description: list.description,
        type: list.type,
        starts_at: list.starts_at,
        ends_at: list.ends_at,
        product_ids: productIds,
      });
    }
  }

  res.json({ promotions });
}
