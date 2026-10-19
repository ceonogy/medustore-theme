import type { StoreCartLineItem } from "@medusajs/types";

/**
 * Resolve a line item's display fields.
 *
 * Line items carry denormalized snapshots of the product they were
 * added with: `thumbnail`, `product_title`, `variant_title`. Prefer
 * them. Reading `item.variant.product.*` instead is unreliable: cart
 * responses collapse the nested product relation to an id-only object
 * (`variant.product` = { id }), so `variant.product.thumbnail` is
 * undefined and the UI renders empty placeholders. The variant-level
 * and product-level fallbacks stay for API versions that do expand.
 */
export function resolveLineItemMedia(item: StoreCartLineItem): {
  thumbnailUrl: string | null;
  productTitle: string | null;
  variantTitle: string | null;
} {
  const variant = item.variant as
    | (NonNullable<StoreCartLineItem["variant"]> & {
        product?: {
          title?: string;
          thumbnail?: string | null;
          images?: { url: string }[];
        } | null;
      })
    | null;

  return {
    thumbnailUrl:
      item.thumbnail ||
      variant?.thumbnail ||
      variant?.product?.thumbnail ||
      variant?.product?.images?.[0]?.url ||
      null,
    productTitle:
      item.product_title || item.title || variant?.product?.title || null,
    variantTitle: item.variant_title || variant?.title || null,
  };
}
