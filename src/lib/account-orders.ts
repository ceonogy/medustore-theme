import { sdk } from "@lib/sdk";

export interface AccountOrderItem {
  id: string;
  title: string;
  product_title: string | null;
  variant_title: string | null;
  quantity: number;
  thumbnail: string | null;
  total: number;
}

export interface AccountOrderAddress {
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  province?: string | null;
  address_1?: string | null;
  country_code?: string | null;
  phone?: string | null;
}

export interface AccountOrder {
  id: string;
  display_id: number;
  status: string;
  created_at: string;
  email: string | null;
  currency_code: string;
  total: number;
  item_total: number;
  shipping_total: number;
  tax_total: number;
  items: AccountOrderItem[];
  shipping_address: AccountOrderAddress | null;
  billing_address: AccountOrderAddress | null;
}

/** Orders of the signed-in customer (GET /store/account/orders). */
export async function listOrders(): Promise<AccountOrder[]> {
  const { orders } = await sdk.client.fetch<{ orders: AccountOrder[] }>(
    "/store/account/orders",
  );
  return orders;
}

/** One owned order (GET /store/account/orders/:id) — 404 for other customers. */
export async function getOrder(orderId: string): Promise<AccountOrder> {
  const { order } = await sdk.client.fetch<{ order: AccountOrder }>(
    `/store/account/orders/${orderId}`,
  );
  return order;
}

/** Display snapshot for an order item (denormalized when the order was placed). */
export function resolveOrderItemMedia(item: AccountOrderItem): {
  thumbnailUrl: string | null;
  productTitle: string;
  variantTitle: string | null;
} {
  return {
    thumbnailUrl: item.thumbnail,
    productTitle: item.product_title || item.title,
    variantTitle: item.variant_title,
  };
}
