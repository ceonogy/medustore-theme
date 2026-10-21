import { listOrders } from "@lib/account-orders";
import { hasSessionToken, me } from "@lib/auth";
import { joinFullName } from "@lib/utils/name";

export interface CheckoutPrefill {
  email: string;
  phone: string;
  fullName: string;
  address: string;
  province: string;
  ward: string;
  country: string;
}

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

    return {
      email: customer.email ?? "",
      phone: customer.phone || addr?.phone || "",
      fullName:
        joinFullName(customer) || (addr ? joinFullName(addr) : "") || "",
      address: addr?.address_1 ?? "",
      province: addr?.province ?? "",
      ward: addr?.city ?? "",
      country: addr?.country_code ?? "",
    };
  } catch {
    return null;
  }
}
