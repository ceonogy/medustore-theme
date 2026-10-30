/**
 * Promotion URLs are derived from the price list's title: `/khuyen-mai/{slug}`
 * must be stable, ASCII and lowercase, following the same slug rules as the
 * catalogue's flat URLs (`đ` → `d`, Vietnamese diacritics stripped, anything
 * non-alphanumeric collapsed into single hyphens).
 *
 * Kept in its own module (not `route.ts`) so it can be unit-tested without
 * booting Medusa.
 */
export const slugify = (title: string): string => {
  const slug = title
    // `đ` has no combining-mark decomposition, so it needs an explicit map
    // once the accents have been stripped from the rest.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // A title that yields nothing (symbols only) still needs a working URL.
  return slug;
};
