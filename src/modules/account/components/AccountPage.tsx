import type { StoreCustomer } from "@medusajs/types";
import { useTranslations, type Locale } from "@i18n";
import { me, toAuthError, updateProfile } from "@lib/auth";
import { isValidVietnamPhone } from "@lib/utils/phone";
import { joinFullName, splitFullName } from "@lib/utils/name";
import { useEffect, useState, type FormEvent } from "react";
import { AccountShell } from "./AccountShell";

interface AccountPageProps {
  locale: Locale;
  /** Login URL (with ?next=) for unauthenticated visitors. */
  loginPath: string;
}

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

/**
 * Customer dashboard: greeting + editable profile. One "Họ & Tên" field,
 * matching checkout — it is split into Medusa's first/last columns on save
 * with the same convention checkout uses (last word = given name).
 * Unauthenticated visitors are sent to login with `?next=`.
 */
export const AccountPage = ({ locale, loginPath }: AccountPageProps) => {
  const t = useTranslations(locale);

  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [ready, setReady] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    let active = true;
    me()
      .then((found) => {
        if (!active) return;
        if (!found) {
          window.location.assign(loginPath);
          return;
        }
        setCustomer(found);
        setFullName(joinFullName(found));
        setPhone(found.phone ?? "");
        setReady(true);
      })
      .catch(() => {
        // Session unusable (e.g. expired while offline): treat as a guest.
        if (active) window.location.assign(loginPath);
      });
    return () => {
      active = false;
    };
  }, [loginPath]);

  const displayName = joinFullName(customer ?? {}) || customer?.email || "";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFormError("");
    setFieldError("");

    if (!fullName.trim()) {
      setFieldError(t("account.error.nameRequired"));
      return;
    }
    const phoneValue = phone.trim();
    if (phoneValue && !isValidVietnamPhone(phoneValue)) {
      setFieldError(t("account.profile.phoneInvalid"));
      return;
    }

    setBusy(true);
    try {
      const { first_name, last_name } = splitFullName(fullName);
      const updated = await updateProfile({
        first_name,
        last_name,
        phone: phoneValue || null,
      });
      setCustomer(updated);
      setSaved(true);
    } catch (error) {
      const code = toAuthError(error).code;
      setFormError(
        code === "session_expired" || code === "network"
          ? t(`account.error.${code}`)
          : t("account.profile.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <section className="wrap flex min-h-[40vh] items-center justify-center py-16">
        <p className="text-ink/60" aria-busy="true">
          {t("account.dashboard.loading")}
        </p>
      </section>
    );
  }

  return (
    <AccountShell
      locale={locale}
      heading={t("account.dashboard.title")}
      active="account"
    >
      <p className="mt-3 text-ink/70">
        {t("account.dashboard.greeting", { name: displayName })}
      </p>

      <h2 className="mt-10 text-xl font-bold">{t("account.profile.title")}</h2>

      <form onSubmit={onSubmit} noValidate className="mt-6 max-w-2xl space-y-4">
        <div>
          <label htmlFor="profile-full-name" className={LABEL}>
            {t("account.field.fullName")}
          </label>
          <input
            id="profile-full-name"
            name="name"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            aria-invalid={Boolean(fieldError)}
            className={`${INPUT_BASE} ${fieldError ? "border-red-400" : "border-gray-300"}`}
          />
        </div>

        <div>
          <label htmlFor="profile-email" className={LABEL}>
            {t("account.field.email")}
          </label>
          <input
            id="profile-email"
            type="email"
            name="email"
            value={customer?.email ?? ""}
            readOnly
            aria-readonly="true"
            aria-describedby="profile-email-note"
            className={`${INPUT_BASE} border-gray-200 bg-fog/40 text-ink/60`}
          />
          <p id="profile-email-note" className="mt-1 text-xs text-ink/55">
            {t("account.profile.emailReadonly")}
          </p>
        </div>

        <div>
          <label htmlFor="profile-phone" className={LABEL}>
            {t("account.profile.phone")}
          </label>
          <input
            id="profile-phone"
            type="tel"
            name="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={Boolean(fieldError)}
            aria-describedby="profile-phone-hint"
            className={`${INPUT_BASE} ${fieldError ? "border-red-400" : "border-gray-300"}`}
          />
          <p id="profile-phone-hint" className="mt-1 text-xs text-ink/55">
            {t("account.profile.phoneHint")}
          </p>
        </div>

        <p className={ERROR} role={fieldError ? "alert" : undefined}>
          {fieldError}
        </p>

        {formError && (
          <p
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {formError}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-ink/70">
            {t("account.profile.saved")}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? t("account.working") : t("account.profile.save")}
        </button>
      </form>
    </AccountShell>
  );
};
