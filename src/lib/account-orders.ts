import { sdk } from "@lib/sdk";
import { displayVariantTitle } from "@lib/utils/variant-title";

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
  /** Free-form extras — carries the GoShip `goship_*` geo codes/names. */
  metadata?: Record<string, unknown> | null;
}

export interface AccountOrder {
  id: string;
  display_id: number;
  status: string;
  /** Computed by Medusa from payments (captured/authorized/refunded/...). */
  payment_status?: string | null;
  /** Computed by Medusa from fulfillment timestamps (shipped/delivered/...). */
  fulfillment_status?: string | null;
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
  /** Latest GoShip shipment summary (null when nothing shipped yet). */
  shipping?: AccountOrderShipping | null;
}

/** One step in the GoShip delivery timeline. */
export interface AccountOrderShipmentEvent {
  status: string;
  status_text: string | null;
  description: string | null;
  update_time: number | null;
  is_return: boolean;
  is_lost: boolean;
}

/** GoShip shipment summary attached to a customer's order. */
export interface AccountOrderShipping {
  id: string;
  phase: "pending" | "shipped" | "delivered" | "canceled" | string;
  /** GoShip order code (`gcode`). */
  gcode: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  /** Shop-side shipping label (usually empty for customers). */
  label_url?: string | null;
  carrier: string | null;
  carrier_short_name: string | null;
  service: string | null;
  expected: string | null;
  status: number | string | null;
  status_text: string | null;
  created_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  timeline: AccountOrderShipmentEvent[];
}

/** One page of the signed-in customer's orders (GET /store/account/orders). */
export interface AccountOrderPage {
  orders: AccountOrder[];
  /** Customer's total order count — whether more pages exist. */
  count: number;
}

/**
 * Orders of the signed-in customer, newest first. Paginated (30/page by
 * default); pass `skip` to fetch the next page when `count > orders.length`.
 */
export async function listOrders(params?: {
  take?: number;
  skip?: number;
}): Promise<AccountOrderPage> {
  const search = new URLSearchParams();
  if (params?.take) search.set("take", String(params.take));
  if (params?.skip) search.set("skip", String(params.skip));
  const qs = search.toString();
  return sdk.client.fetch<AccountOrderPage>(
    `/store/account/orders${qs ? `?${qs}` : ""}`,
  );
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
    variantTitle: displayVariantTitle(item.variant_title),
  };
}
