import { localizePath, useTranslations, type Locale } from "@i18n";
import { resetPassword, toAuthError } from "@lib/auth";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

const INPUT_BASE =
  "w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors";
const LABEL = "type-label block mb-2";
const ERROR = "text-red-500 text-xs mt-1 min-h-4";

interface ResetPasswordFormProps {
  locale: Locale;
}

/**
 * "Đặt lại mật khẩu" — the landing page of the emailed reset link.
 *
 * The token travels in the URL FRAGMENT (`#…`), so it never reaches
 * server access logs or Referer headers; this component reads it once,
 * drops it from the address bar/history, and submits it as the bearer of
 * `POST /auth/customer/emailpass/update`. The backend atomically
 * consumes the single-use, purpose-bound token (15-minute TTL) and
 * rejects replays and session bearers — a failure renders the generic
 * invalid-link message.
 */
export const ResetPasswordForm = ({ locale }: ResetPasswordFormProps) => {
  const t = useTranslations(locale);

  /** null = still reading the URL fragment; "" = no usable token. */
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, "");
    // Tolerate both `#<jwt>` and `#token=<jwt>` link shapes.
    const value = raw.startsWith("token=") ? raw.slice("token=".length) : raw;
    let tokenValue = value;
    try {
      tokenValue = value ? decodeURIComponent(value) : "";
    } catch {
      tokenValue = value; // malformed percent-encoding — send as-is, it will fail server-side
    }
    setToken(tokenValue);
    // The secret has served its purpose in memory — remove it from the
    // address bar and history.
    if (raw) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFieldError("");
    setFormError("");

    if (password.length < 8) {
      setFieldError(t("account.error.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      setFieldError(t("account.reset.mismatch"));
      return;
    }
    if (!token) return;

    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (error) {
      const status = toAuthError(error).status;
      setFormError(
        status === 400 || status === 401 || status === 403
          ? t("account.reset.invalidToken")
          : status === 429
            ? t("account.forgot.rateLimited")
            : t("account.forgot.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const loginHref = localizePath(locale, "/tai-khoan/dang-nhap");
  const forgotHref = localizePath(locale, "/tai-khoan/quen-mat-khau");
  const shell = (content: ReactNode) => (
    <section className="wrap flex min-h-[60vh] items-center justify-center py-16 wide:py-24">
      <div className="w-full max-w-md">
        <h1 className="type-title">{t("account.reset.title")}</h1>
        {content}
      </div>
    </section>
  );

  if (done) {
    return shell(
      <>
        <p
          role="status"
          className="mt-8 rounded border border-line bg-fog px-4 py-3 text-sm"
        >
          {t("account.reset.success")}
        </p>
        <p className="mt-6">
          <a href={loginHref} className="btn w-full">
            {t("account.reset.toLogin")}
          </a>
        </p>
      </>,
    );
  }

  if (token === null) {
    return shell(
      <p className="mt-8 text-ink/60" aria-busy="true">
        {t("account.reset.checking")}
      </p>,
    );
  }

  if (!token) {
    return shell(
      <>
        <p
          role="alert"
          className="mt-8 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {t("account.reset.invalidToken")}
        </p>
        <p className="mt-6">
          <a href={forgotHref} className="btn w-full">
            {t("account.forgot.submit")}
          </a>
        </p>
      </>,
    );
  }

  return shell(
    <>
      <p className="mt-3 text-ink/70">{t("account.reset.subtitle")}</p>
      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
        <div>
          <label htmlFor="reset-password" className={LABEL}>
            {t("account.field.password")}
          </label>
          <input
            id="reset-password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${INPUT_BASE} border-gray-300`}
          />
        </div>
        <div>
          <label htmlFor="reset-password-confirm" className={LABEL}>
            {t("account.reset.passwordConfirm")}
          </label>
          <input
            id="reset-password-confirm"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            className={`${INPUT_BASE} border-gray-300`}
          />
          <p className={ERROR}>{fieldError ?? ""}</p>
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
          {busy ? t("account.working") : t("account.reset.submit")}
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
    </>,
  );
};
