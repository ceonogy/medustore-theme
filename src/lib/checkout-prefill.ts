import { listOrders } from "@lib/account-orders";
import { hasSessionToken, me } from "@lib/auth";
import { joinFullName } from "@lib/utils/name";

export interface CheckoutPrefill {
  email: string;
  phone: string;
  fullName: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  /** GoShip geo codes carried over from a previous order's address metadata. */
  provinceCode: string;
  districtCode: string;
  wardCode: string;
  country: string;
}

const asString = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Account data for the checkout address step: email and name come straight
 * from the signed-in customer; the address (and the phone, when the customer
 * profile has none) come from the most recent order they placed. Returns null
 * for guests and on any failure — prefilling must never break checkout.
 */
export async function fetchCheckoutPrefill(): Promise<CheckoutPrefill | null> {
  try {
    if (!(await hasSessionToken())) return null;
    const customer = await me();
    if (!customer) return null;

    let latestOrder;
    try {
      latestOrder = (await listOrders({ take: 1 })).orders[0];
    } catch {
      latestOrder = undefined;
    }
    const addr = latestOrder?.shipping_address ?? null;
    const meta = (addr?.metadata ?? {}) as Record<string, unknown>;

    return {
      email: customer.email ?? "",
      phone: customer.phone || addr?.phone || "",
      fullName:
        joinFullName(customer) || (addr ? joinFullName(addr) : "") || "",
      address: addr?.address_1 ?? "",
      province: addr?.province ?? "",
      district: asString(meta.goship_district_name),
      ward: addr?.city ?? "",
      provinceCode: asString(meta.goship_city_code),
      districtCode: asString(meta.goship_district_code),
      wardCode: asString(meta.goship_ward_code),
      country: addr?.country_code ?? "",
    };
  } catch {
    return null;
  }
}
