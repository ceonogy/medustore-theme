import type { HttpTypes } from "@medusajs/types";
import { sdk } from "@lib/sdk";
import { listAllProducts } from "@lib/utils/product-pagination";

/**
 * Pages through the catalog rather than taking Medusa's default first page, so
 * the store grid and the filters derived from it cover every product.
 */
export const listProducts = async (regionId: string) => {
  try {
    return await listAllProducts<HttpTypes.StoreProduct>(regionId, (query) =>
      sdk.store.product.list(query),
    );
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch products");
  }
};

/**
 * Medusa answered "no such product" — kept separate from the API being
 * unreachable, so a backend outage can never masquerade as a 404.
 */
export class ResourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceNotFoundError";
  }
}

const isNotFoundResponse = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  (error as { statusCode?: unknown }).statusCode === 404;

const PRODUCT_DETAIL_FIELDS =
  "*variants.calculated_price,+variants.inventory_quantity,*variants.images,+metadata,+tags," +
  "+material,+origin_country,+weight,+length,+width,+height,+type,+handle";

/**
 * Resolves a product from the route segment, which is either the SEO handle
 * (`ao-so-mi-caro-co-dien`) or, for links published before the rename, the raw
 * id (`prod_…`).
 */
export const retrieveProduct = async (productRef: string, regionId: string) => {
  const query = {
    region_id: regionId,
    fields: PRODUCT_DETAIL_FIELDS,
  };

  try {
    if (productRef.startsWith("prod_")) {
      const { product } = await sdk.store.product.retrieve(productRef, query);
      return product;
    }

    const { products } = await sdk.store.product.list({
      ...query,
      handle: productRef,
      limit: 1,
    });

    if (!products?.[0]) {
      throw new ResourceNotFoundError(
        `No product matches handle "${productRef}"`,
      );
    }
    return products[0];
  } catch (error) {
    if (error instanceof ResourceNotFoundError) throw error;
    if (isNotFoundResponse(error)) {
      throw new ResourceNotFoundError(`No product matches id "${productRef}"`);
    }
    console.error(error);
    throw new Error("Failed to fetch product");
  }
};
