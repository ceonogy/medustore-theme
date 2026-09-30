import { useTranslations, type Locale } from "@i18n";
import { useState, type FormEvent } from "react";

interface Props {
  locale: Locale;
}

/**
 * Newsletter capture. The demo has no mailing backend, so a valid submit is
 * acknowledged locally — swap `handleSubmit` for a real endpoint later.
 */
export const Newsletter = ({ locale }: Props) => {
  const t = useTranslations(locale);
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubscribed(true);
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 tablet:flex-row"
      >
        <label className="sr-only" htmlFor="newsletter-email">
          {t("home.newsletterEmailLabel")}
        </label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          disabled={subscribed}
          placeholder={t("home.newsletterPlaceholder")}
          className="field flex-1 disabled:cursor-not-allowed disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={subscribed}
          className="btn shrink-0 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {t("home.newsletterSubmit")}
        </button>
      </form>
      <p
        role="status"
        aria-live="polite"
        className="type-body mt-3 min-h-[20px] text-center text-stock"
      >
        {subscribed ? t("home.newsletterSuccess") : ""}
      </p>
    </div>
  );
};
