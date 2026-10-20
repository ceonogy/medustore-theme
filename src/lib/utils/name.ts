/**
 * Vietnamese full-name helpers shared by checkout and the account CP so both
 * use ONE "Họ & Tên" field while Medusa keeps the split columns.
 *
 * Storage convention matches checkout: the last word is the given name
 * (`first_name`), everything before it the family name (`last_name`) —
 * "Nguyễn Văn An" -> first "An", last "Nguyễn Văn".
 */
export function splitFullName(full: string): {
  first_name: string;
  last_name: string;
} {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return {
    first_name: parts[parts.length - 1],
    last_name: parts.slice(0, -1).join(" "),
  };
}

/** Rebuild the display name from Medusa's split columns (family first). */
export function joinFullName(source: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  return [source.last_name, source.first_name].filter(Boolean).join(" ");
}
