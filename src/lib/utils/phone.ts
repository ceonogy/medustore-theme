/**
 * Vietnamese phone validation shared by checkout and the account CP.
 *
 * Rules (post-2017 numbering plan):
 *  - Mobile:   03x / 05x / 07x / 08x / 09x + 8 digits  (10 digits total)
 *  - Landline: 02x area code + 7–8 digits                (10–11 digits)
 *  - International: `+84`/`84` prefix with the national number after it.
 *
 * Separators people habitually type (spaces, dots, dashes, parens) are
 * ignored, so "0912 345.678" and "+84 912-345-678" both validate.
 */

const VN_MOBILE = /^0[35789]\d{8}$/;
const VN_LANDLINE = /^02\d{8,9}$/;

export function isValidVietnamPhone(raw: string): boolean {
  let v = raw.trim().replace(/[\s.()-]/g, "");
  if (v.startsWith("+84")) v = "0" + v.slice(3);
  else if (v.startsWith("84")) v = "0" + v.slice(2);
  return VN_MOBILE.test(v) || VN_LANDLINE.test(v);
}
