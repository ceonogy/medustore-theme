import type { HttpTypes } from "@medusajs/types";

export type ProductVariant = {
  id: HttpTypes.StoreProductVariant["id"];
  sku: HttpTypes.StoreProductVariant["sku"];
  calculated_price?: {
    calculated_amount: number | null;
    original_amount: number | null;
    currency_code: string | null;
    calculated_price?: {
      price_list_type: string | null;
    };
  };
  /** Variant options carry the size vocabulary (value + owning option). */
  options?:
    | {
        value?: string | null;
        option_id?: string | null;
        option?: { title?: string | null } | null;
      }[]
    | null;
};

export type FilterKey = "category" | "collection" | "size" | "origin";

export type FilterOption = {
  value: string;
  label: string;
  count: number;
};

export type FilterGroup = {
  key: FilterKey;
  label: string;
  options: FilterOption[];
};
