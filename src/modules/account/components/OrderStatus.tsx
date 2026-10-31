import { useTranslations, type Locale } from "@i18n";

const STYLES: Record<string, string> = {
  pending: "bg-sand text-ink",
  authorized: "bg-fog text-ink",
  not_paid: "bg-sale/10 text-sale",
  awaiting: "bg-sand text-ink",
  requires_action: "bg-sale/10 text-sale",
  captured: "bg-stock/10 text-stock",
  partially_captured: "bg-sand text-ink",
  partially_authorized: "bg-sand text-ink",
  refunded: "bg-fog text-muted",
  partially_refunded: "bg-fog text-muted",
  not_fulfilled: "bg-sand text-ink",
  partially_fulfilled: "bg-sand text-ink",
  fulfilled: "bg-stock/10 text-stock",
  partially_shipped: "bg-sand text-ink",
  shipped: "bg-sand text-ink",
  partially_delivered: "bg-sand text-ink",
  delivered: "bg-stock/10 text-stock",
  partially_returned: "bg-fog text-muted",
  returned: "bg-fog text-muted",
  canceled: "bg-fog text-muted",
  draft: "bg-fog text-muted",
  completed: "bg-stock/10 text-stock",
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
