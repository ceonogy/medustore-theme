/**
 * Variant label display rules.
 *
 * Medusa always stores a `title` on a variant. Products that have no real
 * choices (a single sellable unit) are usually created with a placeholder
 * title such as "Mặc định" / "Default variant". Showing that adds noise to
 * the cart, checkout summary and order pages, so we hide it and keep the
 * label only when it actually carries information (a real option value such
 * as "Đỏ" or "Size M").
 */

/** Placeholder titles that mean "only one variant" — never worth showing. */
const PLACEHOLDER_VARIANT_TITLES = new Set([
  "mặc định",
  "mac dinh",
  "biến thể mặc định",
  "default",
  "default variant",
]);

/**
 * Return a display-ready variant title, or `null` when it is empty or a
 * placeholder default (so callers can simply skip rendering).
 */
export function displayVariantTitle(
  title: string | null | undefined,
): string | null {
  if (!title) {
    return null;
  }

  const trimmed = title.trim();
  if (!trimmed || PLACEHOLDER_VARIANT_TITLES.has(trimmed.toLowerCase())) {
    return null;
  }

  return trimmed;
}
