import type {
  FieldErrors,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { useTranslations, type Locale } from "@i18n";
import {
  fetchGoshipDistricts,
  fetchGoshipProvinces,
  fetchGoshipWards,
  type GoshipLocation,
} from "@lib/goship";
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
   *  in the address metadata (GoShip needs it). */
  district: string;
  /** Phường/Xã (name) — saved to Medusa `city` (this API drops `district`). */
  ward: string;
  /** GoShip province code — needed to create a shipment / quote a rate. */
  provinceCode: string;
  /** GoShip district code. */
  districtCode: string;
  /** GoShip ward code. */
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

  const [provinces, setProvinces] = useState<GoshipLocation[]>([]);
  const [districts, setDistricts] = useState<GoshipLocation[]>([]);
  const [wards, setWards] = useState<GoshipLocation[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // Latest values, so the async loaders can resolve codes for saved addresses
  // without re-subscribing on every keystroke.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Cấp 1: 63 tỉnh/thành — tải một lần khi mở form.
  useEffect(() => {
    let cancelled = false;
    fetchGoshipProvinces()
      .then((list) => {
        if (!cancelled) setProvinces(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cấp 2: quận/huyện theo tỉnh đã chọn.
  useEffect(() => {
    const cityCode = values.provinceCode;
    if (!cityCode) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    setLoadingDistricts(true);
    fetchGoshipDistricts(cityCode)
      .then((list) => {
        if (!cancelled) setDistricts(list);
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDistricts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [values.provinceCode]);

  // Cấp 3: phường/xã theo quận/huyện đã chọn.
  useEffect(() => {
    const districtCode = values.districtCode;
    if (!districtCode) {
      setWards([]);
      return;
    }
    let cancelled = false;
    setLoadingWards(true);
    fetchGoshipWards(districtCode)
      .then((list) => {
        if (!cancelled) setWards(list);
      })
      .catch(() => {
        if (!cancelled) setWards([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingWards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [values.districtCode]);

  // Địa chỉ cũ chỉ có name (không có code) → khớp name để suy ra code, để
  // dropdown hiển thị đúng và metadata có mã khi khách không sửa lại.
  useEffect(() => {
    if (!provinces.length || values.provinceCode || !values.province) return;
    const match = provinces.find((p) => p.name === values.province);
    if (match) setValue(f("provinceCode"), match.code);
  }, [provinces, values.province, values.provinceCode]);

  useEffect(() => {
    if (!districts.length || values.districtCode || !values.district) return;
    const match = districts.find((d) => d.name === values.district);
    if (match) setValue(f("districtCode"), match.code);
  }, [districts, values.district, values.districtCode]);

  useEffect(() => {
    if (!wards.length || values.wardCode || !values.ward) return;
    const match = wards.find((w) => w.name === values.ward);
    if (match) setValue(f("wardCode"), match.code);
  }, [wards, values.ward, values.wardCode]);

  const onProvinceChange = (code: string) => {
    if (code === values.provinceCode) return;
    const name = provinces.find((p) => p.code === code)?.name ?? "";
    // Tỉnh mới làm mất hiệu lực quận + phường đang chọn.
    setValue(f("provinceCode"), code, { shouldValidate: true });
    setValue(f("province"), name, { shouldValidate: true });
    setValue(f("districtCode"), "", { shouldValidate: false });
    setValue(f("district"), "", { shouldValidate: false });
    setValue(f("wardCode"), "", { shouldValidate: false });
    setValue(f("ward"), "", { shouldValidate: false });
  };

  const onDistrictChange = (code: string) => {
    if (code === values.districtCode) return;
    const name = districts.find((d) => d.code === code)?.name ?? "";
    setValue(f("districtCode"), code, { shouldValidate: true });
    setValue(f("district"), name, { shouldValidate: true });
    setValue(f("wardCode"), "", { shouldValidate: false });
    setValue(f("ward"), "", { shouldValidate: false });
  };

  const onWardChange = (code: string) => {
    const name = wards.find((w) => w.code === code)?.name ?? "";
    setValue(f("wardCode"), code, { shouldValidate: true });
    setValue(f("ward"), name, { shouldValidate: true });
  };

  return (
    <div className="space-y-4">
      {/* Hidden carriers for the GoShip codes + district name, persisted into
          the address metadata on submit. */}
      <input type="hidden" {...register(f("provinceCode"))} />
      <input type="hidden" {...register(f("districtCode"))} />
      <input type="hidden" {...register(f("wardCode"))} />
      <input type="hidden" {...register(f("district"))} />

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

      {/* Row 2: Tỉnh/Thành phố -> Quận/Huyện (GoShip 3-level hierarchy) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <ThemeSelect
            testId="province-select"
            value={values.provinceCode}
            placeholder={t("checkout.address.province")}
            options={provinces.map((p) => ({ value: p.code, label: p.name }))}
            invalid={Boolean(errors.provinceCode)}
            onChange={onProvinceChange}
          />
          <p className={ERROR}>{errors.provinceCode?.message ?? ""}</p>
        </div>
        <div>
          <ThemeSelect
            testId="district-select"
            value={values.districtCode}
            placeholder={
              loadingDistricts
                ? t("checkout.address.loading")
                : t("checkout.address.district")
            }
            options={districts.map((d) => ({ value: d.code, label: d.name }))}
            disabled={!values.provinceCode || loadingDistricts}
            invalid={Boolean(errors.districtCode)}
            onChange={onDistrictChange}
          />
          <p className={ERROR}>{errors.districtCode?.message ?? ""}</p>
        </div>
      </div>

      {/* Row 3: Phường/Xã */}
      <div>
        <ThemeSelect
          testId="ward-select"
          value={values.wardCode}
          placeholder={
            loadingWards
              ? t("checkout.address.loading")
              : t("checkout.address.ward")
          }
          options={wards.map((w) => ({ value: w.code, label: w.name }))}
          disabled={!values.districtCode || loadingWards}
          invalid={Boolean(errors.wardCode)}
          onChange={onWardChange}
        />
        <p className={ERROR}>{errors.wardCode?.message ?? ""}</p>
      </div>

      {loadError && (
        <p className="text-red-500 text-xs">
          {t("checkout.address.locationsFailed")}
        </p>
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
