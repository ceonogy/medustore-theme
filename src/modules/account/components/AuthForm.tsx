import { localizePath, useTranslations, type Locale } from "@i18n";
import {
  login as loginCustomer,
  me,
  register as registerCustomer,
  toAuthError,
} from "@lib/auth";
import { sanitizeNextPath } from "@lib/utils/auth-session";
import { useEffect, useState, type FormEvent } from "react";

interface AuthFormProps {
  locale: Locale;
  mode: "login" | "register";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

type FieldErrors = {
  email?: string;
  password?: string;
  name?: string;
};

/**
 * Shared login / signup form. On success it hard-navigates to the sanitized
 * `?next=` target (or `/`), so the fresh document picks up the new session.
 */
export const AuthForm = ({ locale, mode }: AuthFormProps) => {
  const t = useTranslations(locale);
  const isLogin = mode === "login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Already signed in? Leave the auth page right away.
  useEffect(() => {
    let active = true;
    me()
      .then((customer) => {
        if (customer && active) window.location.assign(destination());
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const destination = () =>
    sanitizeNextPath(
      new URLSearchParams(window.location.search).get("next"),
      "/",
    );

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!email.trim()) {
      errors.email = t("account.error.emailRequired");
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      errors.email = t("account.error.emailInvalid");
    }
    if (!password) {
      errors.password = t("account.error.passwordRequired");
    } else if (password.length < 8) {
      errors.password = t("account.error.passwordTooShort");
    }
    if (!isLogin && (!firstName.trim() || !lastName.trim())) {
      errors.name = t("account.error.nameRequired");
    }
    return errors;
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    try {
      if (isLogin) {
        await loginCustomer({ email: email.trim(), password });
      } else {
        await registerCustomer({
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        });
      }
      window.location.assign(destination());
    } catch (error) {
      setFormError(t(`account.error.${toAuthError(error).code}`));
      setBusy(false);
    }
  };

  return (
    <section className="wrap flex min-h-[60vh] items-center justify-center py-16 wide:py-24">
      <div className="w-full max-w-md">
        <h1 className="type-title">
          {isLogin ? t("account.login.title") : t("account.register.title")}
        </h1>
        <p className="mt-3 text-ink/70">
          {isLogin
            ? t("account.login.subtitle")
            : t("account.register.subtitle")}
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="account-first-name" className={LABEL}>
                  {t("account.field.firstName")}
                </label>
                <input
                  id="account-first-name"
                  name="given-name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={`${INPUT_BASE} ${fieldErrors.name ? "border-red-400" : "border-gray-300"}`}
                />
              </div>
              <div>
                <label htmlFor="account-last-name" className={LABEL}>
                  {t("account.field.lastName")}
                </label>
                <input
                  id="account-last-name"
                  name="family-name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={`${INPUT_BASE} ${fieldErrors.name ? "border-red-400" : "border-gray-300"}`}
                />
              </div>
              <p className={`${ERROR} sm:col-span-2`}>
                {fieldErrors.name ?? ""}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="account-email" className={LABEL}>
              {t("account.field.email")}
            </label>
            <input
              id="account-email"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("account.field.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={
                fieldErrors.email ? "account-email-error" : undefined
              }
              className={`${INPUT_BASE} ${fieldErrors.email ? "border-red-400" : "border-gray-300"}`}
            />
            <p id="account-email-error" className={ERROR}>
              {fieldErrors.email ?? ""}
            </p>
          </div>

          <div>
            <label htmlFor="account-password" className={LABEL}>
              {t("account.field.password")}
            </label>
            <input
              id="account-password"
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={
                fieldErrors.password
                  ? "account-password-error"
                  : "account-password-hint"
              }
              className={`${INPUT_BASE} ${fieldErrors.password ? "border-red-400" : "border-gray-300"}`}
            />
            <p id="account-password-hint" className="mt-1 text-xs text-ink/55">
              {t("account.field.passwordHint")}
            </p>
            <p id="account-password-error" className={ERROR}>
              {fieldErrors.password ?? ""}
            </p>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn w-full disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy
              ? t("account.working")
              : isLogin
                ? t("account.login.submit")
                : t("account.register.submit")}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink/70">
          {isLogin
            ? t("account.login.noAccount")
            : t("account.register.haveAccount")}{" "}
          <a
            href={localizePath(
              locale,
              isLogin ? "/tai-khoan/dang-ky" : "/tai-khoan/dang-nhap",
            )}
            className="font-medium underline underline-offset-4"
          >
            {isLogin
              ? t("account.login.registerLink")
              : t("account.register.loginLink")}
          </a>
        </p>
      </div>
    </section>
  );
};
