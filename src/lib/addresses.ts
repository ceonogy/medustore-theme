import type {
  StoreCreateCustomerAddress,
  StoreCustomerAddress,
  StoreUpdateCustomerAddress,
} from "@medusajs/types";
import { sdk } from "@lib/sdk";
import { toAuthError } from "@lib/utils/auth-session";

/**
 * Customer address book (`/store/customers/me/addresses`) — session-gated
 * like `lib/auth.ts`. The Vietnamese ward lives in `city` and the province
 * in `province`, the same mapping checkout uses for cart addresses (this
 * API version drops `district`).
 *
 * Every helper re-throws as `AuthError` so callers can map
 * `session_expired` / `network` the way the profile form does.
 */
export async function listAddresses(): Promise<StoreCustomerAddress[]> {
  try {
    const { addresses } = await sdk.store.customer.listAddress();
    return (addresses ?? []) as StoreCustomerAddress[];
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function createAddress(
  body: StoreCreateCustomerAddress,
): Promise<void> {
  try {
    await sdk.store.customer.createAddress(body);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function updateAddress(
  addressId: string,
  body: StoreUpdateCustomerAddress,
): Promise<void> {
  try {
    await sdk.store.customer.updateAddress(addressId, body);
  } catch (error) {
    throw toAuthError(error);
  }
}

export async function deleteAddress(addressId: string): Promise<void> {
  try {
    await sdk.store.customer.deleteAddress(addressId);
  } catch (error) {
    throw toAuthError(error);
  }
}
