import type {
  FieldErrors,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useTranslations, type Locale } from "@i18n";
import { ThemeSelect } from "@modules/ui/ThemeSelect";
import { provinces, wards } from "vietnam-address-data";

// Temporarily hidden fields (checkout simplification, 2026-10): the
// country select defaults to Vietnam and the postal code is omitted.
// Flip these back on and the full UI returns — the form values and the
// save path still carry both fields.
export const SHOW_COUNTRY_SELECT = false;
export const SHOW_POSTAL_CODE = false;

export interface RegionCountry {
  iso_2: string;
  display_name?: string;
  name?: string;
}

export interface AddressValues {
  /** Single "Họ & Tên" field — split for Medusa on save. */
  fullName: string;
  address: string;
  company: string;
  /** Tỉnh/Thành phố (post-2025: 34 units) — saved to Medusa `province`. */
  province: string;
  /** Phường/Xã — saved to Medusa `city` (this API drops `district`). */
  ward: string;
  postalCode: string; // disabled — SHOW_POSTAL_CODE
  country: string; // disabled — SHOW_COUNTRY_SELECT, defaults to region
}

// Shared form shape — defined here so AddressFields can type `register`
// correctly without a circular dependency with ShippingAddressStep.
export interface CheckoutFormValues {
  email: string;
  phone: string;
  shipping: AddressValues;
}

/**
 * Split a Vietnamese full name for Medusa: the last word is the given
 * name (`first_name`), everything before it the family name
 * (`last_name`) — "Nguyễn Văn An" -> first "An", last "Nguyễn Văn".
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

/** Recombine a stored name for the form (Vietnamese display order). */
export function joinFullName(
  addr?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null,
): string {
  return [addr?.last_name, addr?.first_name].filter(Boolean).join(" ");
}

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

interface AddressFieldsProps {
  locale: Locale;
  prefix: "shipping" | "billing";
  register: UseFormRegister<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  /** Currently selected province name — drives the ward dropdown. */
  provinceValue: string;
  /** Currently selected ward name. */
  wardValue: string;
  errors: FieldErrors<AddressValues>;
  countries?: RegionCountry[];
}

export const AddressFields = ({
  locale,
  prefix,
  register,
  setValue,
  provinceValue,
  wardValue,
  errors,
  countries,
}: AddressFieldsProps) => {
  const t = useTranslations(locale);
  const f = (name: keyof AddressValues) =>
    `${prefix}.${name}` as Path<CheckoutFormValues>;

  const selectedProvince = provinces.find((p) => p.name === provinceValue);
  const wardOptions = selectedProvince
    ? wards.filter((w) => w.provinceId === selectedProvince.id)
    : [];

  return (
    <div className="space-y-4">
      {/* Row 1: Họ & Tên (single field — split for Medusa on save) */}
      <div>
        <input
          type="text"
          placeholder={t("checkout.address.fullName")}
          {...register(f("fullName"))}
          className={`${INPUT_BASE} ${errors.fullName ? "border-red-400" : "border-gray-300"}`}
        />
        <p className={ERROR}>{errors.fullName?.message ?? ""}</p>
      </div>

      {/* Row 2: Tỉnh/Thành phố -> Phường/Xã (cascading, post-2025
          two-level hierarchy) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <ThemeSelect
            testId="province-select"
            value={provinceValue}
            placeholder={t("checkout.address.province")}
            options={provinces.map((p) => ({ value: p.name, label: p.name }))}
            invalid={Boolean(errors.province)}
            onChange={(v) => {
              setValue(f("province"), v, { shouldValidate: true });
              // A new province invalidates the ward chosen under the old one.
              setValue(f("ward"), "", { shouldValidate: true });
            }}
          />
          <p className={ERROR}>{errors.province?.message ?? ""}</p>
        </div>
        <div>
          <ThemeSelect
            testId="ward-select"
            value={wardValue}
            placeholder={t("checkout.address.ward")}
            options={wardOptions.map((w) => ({ value: w.name, label: w.name }))}
            disabled={!provinceValue}
            invalid={Boolean(errors.ward)}
            onChange={(v) => setValue(f("ward"), v, { shouldValidate: true })}
          />
          <p className={ERROR}>{errors.ward?.message ?? ""}</p>
        </div>
      </div>

      {/* Row 3: Address (one full row, right after the locality
          dropdowns) */}
      <div>
        <input
          type="text"
          placeholder={t("checkout.address.address")}
          {...register(f("address"))}
          className={`${INPUT_BASE} ${errors.address ? "border-red-400" : "border-gray-300"}`}
        />
        <p className={ERROR}>{errors.address?.message ?? ""}</p>
      </div>

      {/* Row 4: Company (optional) */}
      <div>
        <input
          type="text"
          placeholder={t("checkout.address.company")}
          {...register(f("company"))}
          className={`${INPUT_BASE} border-gray-300`}
        />
      </div>

      {/* Temporarily disabled postal code — flip SHOW_POSTAL_CODE on. */}
      {SHOW_POSTAL_CODE && (
        <div>
          <input
            type="text"
            placeholder={t("checkout.address.postalCode")}
            {...register(f("postalCode"))}
            className={`${INPUT_BASE} ${errors.postalCode ? "border-red-400" : "border-gray-300"}`}
          />
          <p className={ERROR}>{errors.postalCode?.message ?? ""}</p>
        </div>
      )}

      {/* Temporarily disabled country select — default stays the
          region's country (Vietnam); flip SHOW_COUNTRY_SELECT on. */}
      {SHOW_COUNTRY_SELECT && countries && (
        <div>
          <select
            {...register(f("country"))}
            className={`${INPUT_BASE} ${errors.country ? "border-red-400" : "border-gray-300"} bg-white`}
          >
            {countries.map((c) => (
              <option key={c.iso_2} value={c.iso_2}>
                {c.display_name ?? c.name}
              </option>
            ))}
          </select>
          <p className={ERROR}>{errors.country?.message ?? ""}</p>
        </div>
      )}
    </div>
  );
};
