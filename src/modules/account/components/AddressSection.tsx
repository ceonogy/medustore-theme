import type {
  StoreCreateCustomerAddress,
  StoreCustomerAddress,
  StoreUpdateCustomerAddress,
} from "@medusajs/types";
import { useTranslations, type Locale } from "@i18n";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "@lib/addresses";
import { toAuthError } from "@lib/utils/auth-session";
import { joinFullName, splitFullName } from "@lib/utils/name";
import { isValidVietnamPhone } from "@lib/utils/phone";
import { ThemeSelect } from "@modules/ui/ThemeSelect";
import { provinces, wards } from "vietnam-address-data";
import { useEffect, useState, type FormEvent } from "react";

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

type FieldErrors = {
  fullName?: string;
  phone?: string;
  address?: string;
  province?: string;
  ward?: string;
};

const EMPTY_FORM = {
  fullName: "",
  phone: "",
  address: "",
  province: "",
  ward: "",
};

interface AddressSectionProps {
  locale: Locale;
}

/**
 * "Địa chỉ" section of the account dashboard: list the customer's saved
 * addresses (name · phone · street · ward, province) with add / edit /
 * delete, mirroring the checkout address vocabulary (single "Họ & Tên"
 * split for Medusa, ward stored in `city`). The store's only region is
 * Vietnam, so `country_code` is fixed to `vn`.
 */
export const AddressSection = ({ locale }: AddressSectionProps) => {
  const t = useTranslations(locale);

  const [addresses, setAddresses] = useState<StoreCustomerAddress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const refresh = async () => {
    setAddresses(await listAddresses());
    setLoaded(true);
  };

  useEffect(() => {
    let active = true;
    listAddresses()
      .then((list) => {
        if (active) {
          setAddresses(list);
          setLoaded(true);
        }
      })
      .catch(() => {
        // Session unusable — the profile form above handles the redirect;
        // here we just stop the spinner.
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors({});
    setNotice("");
    setFormError("");
    setMode("form");
  };

  const openEdit = (address: StoreCustomerAddress) => {
    setForm({
      fullName: joinFullName(address),
      phone: address.phone ?? "",
      address: address.address_1 ?? "",
      province: address.province ?? "",
      // The ward lives in `city` (this API drops `district`).
      ward: address.city ?? "",
    });
    setEditingId(address.id);
    setErrors({});
    setNotice("");
    setFormError("");
    setMode("form");
  };

  const closeForm = () => {
    setMode("list");
    setErrors({});
    setFormError("");
  };

  const setField = (name: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice("");
    setFormError("");

    const nextErrors: FieldErrors = {};
    if (!form.fullName.trim()) {
      nextErrors.fullName = t("account.error.nameRequired");
    }
    if (!form.address.trim()) {
      nextErrors.address = t("checkout.validation.addressRequired");
    }
    if (!form.province) {
      nextErrors.province = t("checkout.validation.provinceRequired");
    }
    if (!form.ward) {
      nextErrors.ward = t("checkout.validation.wardRequired");
    }
    const phoneValue = form.phone.trim();
    if (!phoneValue) {
      nextErrors.phone = t("checkout.validation.phoneRequired");
    } else if (!isValidVietnamPhone(phoneValue)) {
      nextErrors.phone = t("account.profile.phoneInvalid");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const { first_name, last_name } = splitFullName(form.fullName);
      const body = {
        first_name,
        last_name,
        address_1: form.address.trim(),
        city: form.ward,
        province: form.province,
        country_code: "vn",
        // `null` clears a removed phone (verified live); the SDK's TS
        // types only admit `string`, hence the cast.
        phone: phoneValue || null,
      } as StoreCreateCustomerAddress;
      if (editingId) {
        await updateAddress(editingId, body as StoreUpdateCustomerAddress);
      } else {
        await createAddress(body);
      }
      await refresh();
      setMode("list");
      setNotice(t("account.addresses.saved"));
    } catch (error) {
      const code = toAuthError(error).code;
      setFormError(
        code === "session_expired" || code === "network"
          ? t(`account.error.${code}`)
          : t("account.addresses.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (address: StoreCustomerAddress) => {
    if (!window.confirm(t("account.addresses.confirmDelete"))) return;
    setBusy(true);
    setNotice("");
    setFormError("");
    try {
      await deleteAddress(address.id);
      await refresh();
      setNotice(t("account.addresses.deleted"));
    } catch {
      setFormError(t("account.addresses.failed"));
    } finally {
      setBusy(false);
    }
  };

  const selectedProvince = provinces.find((p) => p.name === form.province);
  const wardOptions = selectedProvince
    ? wards.filter((w) => w.provinceId === selectedProvince.id)
    : [];

  if (!loaded) {
    return (
      <p className="mt-4 text-ink/60" aria-busy="true">
        {t("account.dashboard.loading")}
      </p>
    );
  }

  if (mode === "list") {
    return (
      <div className="mt-4 max-w-2xl">
        {notice && (
          <p role="status" className="mb-3 text-sm text-ink/70">
            {notice}
          </p>
        )}
        {formError && (
          <p
            role="alert"
            className="mb-3 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {formError}
          </p>
        )}

        {addresses.length === 0 ? (
          <p className="text-ink/70">{t("account.addresses.empty")}</p>
        ) : (
          <ul className="space-y-3">
            {addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-lg border border-line p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {joinFullName(address)}
                      {address.is_default_shipping && (
                        <span className="rounded-full bg-fog px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink/60">
                          {t("account.addresses.default")}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 break-words text-sm text-ink/70">
                      {address.address_1}
                    </p>
                    <p className="break-words text-sm text-ink/70">
                      {[address.city, address.province]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {address.phone && (
                      <p className="text-sm text-ink/70">{address.phone}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-4 text-sm">
                    <button
                      type="button"
                      onClick={() => openEdit(address)}
                      className="cursor-pointer text-ink/70 underline underline-offset-4 transition-colors hover:text-ink"
                    >
                      {t("account.addresses.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(address)}
                      disabled={busy}
                      className="cursor-pointer text-ink/70 underline underline-offset-4 transition-colors hover:text-sale disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t("account.addresses.delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button type="button" onClick={openAdd} className="btn mt-5">
          {t("account.addresses.add")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 max-w-2xl space-y-4">
      <h3 className="text-base font-medium">
        {editingId
          ? t("account.addresses.editTitle")
          : t("account.addresses.add")}
      </h3>

      <div>
        <label htmlFor="address-full-name" className={LABEL}>
          {t("checkout.address.fullName")}
        </label>
        <input
          id="address-full-name"
          name="name"
          autoComplete="name"
          value={form.fullName}
          onChange={(event) => setField("fullName", event.target.value)}
          aria-invalid={Boolean(errors.fullName)}
          className={`${INPUT_BASE} ${errors.fullName ? "border-red-400" : "border-gray-300"}`}
        />
        <p className={ERROR}>{errors.fullName ?? ""}</p>
      </div>

      <div>
        <label htmlFor="address-phone" className={LABEL}>
          {t("checkout.shipping.phone")}
        </label>
        <input
          id="address-phone"
          type="tel"
          name="tel"
          autoComplete="tel"
          inputMode="tel"
          value={form.phone}
          onChange={(event) => setField("phone", event.target.value)}
          aria-invalid={Boolean(errors.phone)}
          aria-describedby="address-phone-hint"
          className={`${INPUT_BASE} ${errors.phone ? "border-red-400" : "border-gray-300"}`}
        />
        <p id="address-phone-hint" className="mt-1 text-xs text-ink/55">
          {t("account.profile.phoneHint")}
        </p>
        <p className={ERROR}>{errors.phone ?? ""}</p>
      </div>

      <div>
        <label htmlFor="address-street" className={LABEL}>
          {t("checkout.address.address")}
        </label>
        <input
          id="address-street"
          name="address"
          autoComplete="street-address"
          value={form.address}
          onChange={(event) => setField("address", event.target.value)}
          aria-invalid={Boolean(errors.address)}
          className={`${INPUT_BASE} ${errors.address ? "border-red-400" : "border-gray-300"}`}
        />
        <p className={ERROR}>{errors.address ?? ""}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <span className={LABEL}>{t("checkout.address.province")}</span>
          <ThemeSelect
            testId="address-province"
            ariaLabel={t("checkout.address.province")}
            value={form.province}
            placeholder={t("checkout.address.province")}
            options={provinces.map((p) => ({ value: p.name, label: p.name }))}
            invalid={Boolean(errors.province)}
            onChange={(value) => {
              setField("province", value);
              // A new province invalidates the ward chosen under the old one.
              setField("ward", "");
            }}
          />
          <p className={ERROR}>{errors.province ?? ""}</p>
        </div>
        <div>
          <span className={LABEL}>{t("checkout.address.ward")}</span>
          <ThemeSelect
            testId="address-ward"
            ariaLabel={t("checkout.address.ward")}
            value={form.ward}
            placeholder={t("checkout.address.ward")}
            options={wardOptions.map((w) => ({ value: w.name, label: w.name }))}
            disabled={!form.province}
            invalid={Boolean(errors.ward)}
            onChange={(value) => setField("ward", value)}
          />
          <p className={ERROR}>{errors.ward ?? ""}</p>
        </div>
      </div>

      {formError && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="btn disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? t("account.working") : t("account.addresses.save")}
        </button>
        <button
          type="button"
          onClick={closeForm}
          disabled={busy}
          className="cursor-pointer text-sm text-ink/70 underline underline-offset-4 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("account.addresses.cancel")}
        </button>
      </div>
    </form>
  );
};
