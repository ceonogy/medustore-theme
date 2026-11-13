/**
 * Vietnamese address formatting shared by checkout, the order confirmation
 * page and the account pages.
 *
 * This Medusa version drops `district`, so the ward/xã is stored in `city`
 * and the province/tỉnh in `province` (see ShippingAddressStep). A locality
 * line therefore reads ward-first: "Phường Bắc Giang, Bắc Ninh".
 *
 * Rendering `city` alone (without `province`) is the bug this helper guards
 * against — it used to print ", Phường Bắc Giang" and lose the province.
 */

export interface AddressLike {
  address_1?: string | null;
  address_2?: string | null;
  /** Ward/xã (this API version stores the ward in `city`). */
  city?: string | null;
  /** Province/tỉnh or city. */
  province?: string | null;
}

/** "Phường Bắc Giang, Bắc Ninh" — ward then province, skipping blanks. */
export function formatLocality(
  address: AddressLike | null | undefined,
): string {
  return [address?.city, address?.province].filter(Boolean).join(", ");
}

/** Street lines (`address_1`, `address_2`) followed by the locality line. */
export function formatAddressLines(
  address: AddressLike | null | undefined,
): string[] {
  return [address?.address_1, address?.address_2, formatLocality(address)]
    .map((line) => line?.trim() ?? "")
    .filter(Boolean);
}
