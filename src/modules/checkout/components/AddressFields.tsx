import type {
  FieldErrors,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useTranslations, type Locale } from "@i18n";
import { addonClientConfig, addons } from "@lib/addons";
import type { GoshipAddressValue, GoshipSelectProps } from "@lib/addons/types";
import { ThemeSelect } from "@modules/ui/ThemeSelect";

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
  /** Tỉnh/Thành phố (name) — saved to Medusa `province`. */
  province: string;
  /** Quận/Huyện (name) — Medusa has no `district` column, so it lives only
   *  in the address metadata (shipping addons need it). */
  district: string;
  /** Phường/Xã (name) — saved to Medusa `city` (this API drops `district`). */
  ward: string;
  /** Geo province code — needed by the GoShip addon (empty otherwise). */
  provinceCode: string;
  /** Geo district code. */
  districtCode: string;
  /** Geo ward code. */
  wardCode: string;
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

// One shared implementation with the account CP (single "Họ & Tên" field on
// both sides) — re-exported here so checkout importers keep their path.
export { splitFullName } from "@lib/utils/name";
import { joinFullName as joinStoredName } from "@lib/utils/name";

/** Recombine a stored name for the form (Vietnamese display order). */
export function joinFullName(
  addr?: {
    first_name?: string | null;
    last_name?: string | null;
  } | null,
): string {
  return addr ? joinStoredName(addr) : "";
}

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

interface AddressFieldsProps {
  locale: Locale;
  prefix: "shipping" | "billing";
  register: UseFormRegister<CheckoutFormValues>;
  setValue: UseFormSetValue<CheckoutFormValues>;
  /** Current form values — drives the cascading selects (by code). */
  values: AddressValues;
  errors: FieldErrors<AddressValues>;
  countries?: RegionCountry[];
}

export const AddressFields = ({
  locale,
  prefix,
  register,
  setValue,
  values,
  errors,
  countries,
}: AddressFieldsProps) => {
  const t = useTranslations(locale);
  const f = (name: keyof AddressValues) =>
    `${prefix}.${name}` as Path<CheckoutFormValues>;

  // The optional GoShip addon owns the province → district → ward cascade.
  // Without it, the theme falls back to three plain text inputs.
  const goship = addons.goship;
  const clientConfig = addonClientConfig();

  const applyGoshipPatch = (patch: Partial<GoshipAddressValue>) => {
    for (const key of Object.keys(patch) as (keyof GoshipAddressValue)[]) {
      const value = patch[key] ?? "";
      setValue(f(key), value, { shouldValidate: Boolean(value) });
    }
  };

  const goshipValue: GoshipAddressValue = {
    province: values.province,
    district: values.district,
    ward: values.ward,
    provinceCode: values.provinceCode,
    districtCode: values.districtCode,
    wardCode: values.wardCode,
  };

  const renderSelect = (props: GoshipSelectProps) => (
    <ThemeSelect
      testId={props.testId}
      value={props.value}
      placeholder={props.placeholder}
      options={props.options}
      disabled={props.disabled}
      invalid={props.invalid}
      onChange={props.onChange}
    />
  );

  return (
    <div className="space-y-4">
      {/* Hidden carriers for the geo codes + district name, persisted into
          the address metadata on submit (read by shipping addons). */}
      <input type="hidden" {...register(f("provinceCode"))} />
      <input type="hidden" {...register(f("districtCode"))} />
      <input type="hidden" {...register(f("wardCode"))} />
      {goship && <input type="hidden" {...register(f("district"))} />}

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

      {/* Row 2 + 3: locality. Addon when installed, free text otherwise. */}
      {goship ? (
        <goship.AddressFields
          value={goshipValue}
          onChange={applyGoshipPatch}
          baseUrl={clientConfig.baseUrl}
          publishableKey={clientConfig.publishableKey}
          labels={{
            province: t("checkout.address.province"),
            district: t("checkout.address.district"),
            ward: t("checkout.address.ward"),
            loading: t("checkout.address.loading"),
            fallbackHint: t("checkout.address.locationsFailed"),
          }}
          renderSelect={renderSelect}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <input
                type="text"
                placeholder={t("checkout.address.province")}
                {...register(f("province"))}
                className={`${INPUT_BASE} ${errors.province ? "border-red-400" : "border-gray-300"}`}
              />
              <p className={ERROR}>{errors.province?.message ?? ""}</p>
            </div>
            <div>
              <input
                type="text"
                placeholder={t("checkout.address.district")}
                {...register(f("district"))}
                className={`${INPUT_BASE} ${errors.district ? "border-red-400" : "border-gray-300"}`}
              />
              <p className={ERROR}>{errors.district?.message ?? ""}</p>
            </div>
          </div>
          <div>
            <input
              type="text"
              placeholder={t("checkout.address.ward")}
              {...register(f("ward"))}
              className={`${INPUT_BASE} ${errors.ward ? "border-red-400" : "border-gray-300"}`}
            />
            <p className={ERROR}>{errors.ward?.message ?? ""}</p>
          </div>
        </div>
      )}

      {/* Row 4: Address (one full row, right after the locality
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

      {/* Row 5: Company (optional) */}
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
