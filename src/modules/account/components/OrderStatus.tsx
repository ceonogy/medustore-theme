import { useTranslations, type Locale } from "@i18n";

const STYLES: Record<string, string> = {
  pending: "bg-sand text-ink",
  authorized: "bg-fog text-ink",
  partially_fulfilled: "bg-sand text-ink",
  fulfilled: "bg-stock/10 text-stock",
  partially_returned: "bg-fog text-muted",
  returned: "bg-fog text-muted",
  canceled: "bg-fog text-muted",
  requires_action: "bg-sale/10 text-sale",
  draft: "bg-fog text-muted",
};

/** Vietnamese/English label + colour chip for an order status. */
export const OrderStatus = ({
  locale,
  status,
}: {
  locale: Locale;
  status: string;
}) => {
  const t = useTranslations(locale);
  const known = status in STYLES;
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-xs whitespace-nowrap ${
        STYLES[status] ?? "bg-fog text-muted"
      }`}
    >
      {known ? t(`account.status.${status}`) : status}
    </span>
  );
};
