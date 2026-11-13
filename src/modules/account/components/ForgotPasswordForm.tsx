import { localizePath, useTranslations, type Locale } from "@i18n";
import { requestPasswordReset, toAuthError } from "@lib/auth";
import { useState, type FormEvent } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

interface ForgotPasswordFormProps {
  locale: Locale;
}

/**
 * "Quên mật khẩu" — requests a password-reset link by email.
 *
 * The backend's reset route answers 201 for every identifier, existing or
 * not, and the link is delivered only by email — so this form always
 * shows the same generic success (no account enumeration). The only
 * failures that surface are transport errors and the rate guard (429).
 */
export const ForgotPasswordForm = ({ locale }: ForgotPasswordFormProps) => {
  const t = useTranslations(locale);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setEmailError("");
    setFormError("");

    const identifier = email.trim();
    if (!identifier) {
      setEmailError(t("account.error.emailRequired"));
      return;
    }
    if (!EMAIL_PATTERN.test(identifier)) {
      setEmailError(t("account.error.emailInvalid"));
      return;
    }

    setBusy(true);
    try {
      await requestPasswordReset(identifier);
      setSent(true);
    } catch (error) {
      setFormError(
        toAuthError(error).status === 429
          ? t("account.forgot.rateLimited")
          : t("account.forgot.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const loginHref = localizePath(locale, "/tai-khoan/dang-nhap");

  return (
    <section className="wrap flex min-h-[60vh] items-center justify-center py-16 wide:py-24">
      <div className="w-full max-w-md">
        <h1 className="type-title">{t("account.forgot.title")}</h1>
        <p className="mt-3 text-ink/70">{t("account.forgot.subtitle")}</p>

        {sent ? (
          <div className="mt-8 space-y-5">
            <p
              role="status"
              className="rounded border border-line bg-fog px-4 py-3 text-sm"
            >
              {t("account.forgot.success")}
            </p>
            <p>
              <a
                href={loginHref}
                className="text-sm text-ink/70 underline underline-offset-4 transition-colors hover:text-ink"
              >
                {t("account.forgot.backToLogin")}
              </a>
            </p>
            <p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="cursor-pointer text-sm text-ink/70 underline underline-offset-4 transition-colors hover:text-ink"
              >
                {t("account.forgot.sentAgain")}
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor="forgot-email" className={LABEL}>
                {t("account.field.email")}
              </label>
              <input
                id="forgot-email"
                type="email"
                name="email"
                inputMode="email"
                autoComplete="email"
                placeholder={t("account.field.emailPlaceholder")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(emailError)}
                className={`${INPUT_BASE} ${emailError ? "border-red-400" : "border-gray-300"}`}
              />
              <p className={ERROR}>{emailError ?? ""}</p>
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
              {busy ? t("account.working") : t("account.forgot.submit")}
            </button>

            <p className="text-center">
              <a
                href={loginHref}
                className="text-sm text-ink/70 underline underline-offset-4 transition-colors hover:text-ink"
              >
                {t("account.forgot.backToLogin")}
              </a>
            </p>
          </form>
        )}
      </div>
    </section>
  );
};
