import type { StoreCustomer } from "@medusajs/types";
import { useTranslations, type Locale } from "@i18n";
import { logout, me, toAuthError, updateProfile } from "@lib/auth";
import { useEffect, useState, type FormEvent } from "react";

interface AccountPageProps {
  locale: Locale;
  /** Login URL (with ?next=) for unauthenticated visitors. */
  loginPath: string;
}

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";
const PHONE_PATTERN = /^(\+?84|0)\d{8,10}$/;

/**
 * Customer dashboard: greeting + editable profile + logout. Unauthenticated
 * visitors are sent to the login page with `?next=` so they come back here.
 */
export const AccountPage = ({ locale, loginPath }: AccountPageProps) => {
  const t = useTranslations(locale);

  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [ready, setReady] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
        setFirstName(found.first_name ?? "");
        setLastName(found.last_name ?? "");
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

  const displayName =
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    customer?.email ||
    "";

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    setFormError("");
    setFieldError("");

    if (!firstName.trim() || !lastName.trim()) {
      setFieldError(t("account.error.nameRequired"));
      return;
    }
    const phoneValue = phone.trim();
    if (phoneValue && !PHONE_PATTERN.test(phoneValue)) {
      setFieldError(t("account.profile.phoneInvalid"));
      return;
    }

    setBusy(true);
    try {
      const updated = await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
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

  const onLogout = async () => {
    await logout();
    window.location.assign("/");
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
    <section className="wrap py-16 wide:py-24">
      <div className="w-full max-w-2xl">
        <h1 className="type-title">{t("account.dashboard.title")}</h1>
        <p className="mt-3 text-ink/70">
          {t("account.dashboard.greeting", { name: displayName })}
        </p>

        <h2 className="mt-10 text-xl font-bold">
          {t("account.profile.title")}
        </h2>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-first-name" className={LABEL}>
                {t("account.field.firstName")}
              </label>
              <input
                id="profile-first-name"
                name="given-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                aria-invalid={Boolean(fieldError)}
                className={`${INPUT_BASE} ${fieldError ? "border-red-400" : "border-gray-300"}`}
              />
            </div>
            <div>
              <label htmlFor="profile-last-name" className={LABEL}>
                {t("account.field.lastName")}
              </label>
              <input
                id="profile-last-name"
                name="family-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                aria-invalid={Boolean(fieldError)}
                className={`${INPUT_BASE} ${fieldError ? "border-red-400" : "border-gray-300"}`}
              />
            </div>
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

        <div className="mt-12 border-t border-line pt-8">
          <button type="button" onClick={onLogout} className="btn-ghost btn">
            {t("account.logout")}
          </button>
        </div>
      </div>
    </section>
  );
};
