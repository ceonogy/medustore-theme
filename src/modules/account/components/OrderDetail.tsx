import { localizePath, useTranslations, type Locale } from "@i18n";
import {
  getOrder,
  resolveOrderItemMedia,
  type AccountOrder,
  type AccountOrderShipping,
} from "@lib/account-orders";
import { convertToLocale } from "@lib/utils/money";
import { formatAddressLines } from "@lib/utils/address";
import { useEffect, useState } from "react";
import { AccountShell } from "./AccountShell";
import { OrderStatus } from "./OrderStatus";

interface OrderDetailProps {
  locale: Locale;
  orderId: string;
  /** Login URL (with ?next=) for unauthenticated visitors. */
  loginPath: string;
}

type State = "loading" | "ready" | "notfound" | "failed";

const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/** GoShip `update_time` is a UNIX timestamp (seconds, GMT+7). */
const formatEventTime = (unix: number, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unix * 1000));

const PHASE_STYLES: Record<string, string> = {
  pending: "bg-sand text-ink",
  shipped: "bg-sand text-ink",
  delivered: "bg-stock/10 text-stock",
  canceled: "bg-fog text-muted",
};

/** One order: items, totals, shipping address, status. */
export const OrderDetail = ({
  locale,
  orderId,
  loginPath,
}: OrderDetailProps) => {
  const t = useTranslations(locale);
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let active = true;
    getOrder(orderId)
      .then((found) => {
        if (!active) return;
        setOrder(found);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) {
          window.location.assign(loginPath);
          return;
        }
        setState(status === 404 ? "notfound" : "failed");
      });
    return () => {
      active = false;
    };
  }, [orderId, loginPath]);

  const backLink = (
    <a
      href={localizePath(locale, "/tai-khoan/don-hang")}
      className="text-sm underline underline-offset-4 hover:text-ink/70"
    >
      ← {t("account.orders.backToList")}
    </a>
  );

  if (state === "loading") {
    return (
      <section className="wrap flex min-h-[40vh] items-center justify-center py-16">
        <p className="text-ink/60" aria-busy="true">
          {t("account.orders.loading")}
        </p>
      </section>
    );
  }

  if (state !== "ready" || !order) {
    return (
      <AccountShell
        locale={locale}
        heading={t("account.orders.title")}
        active="orders"
      >
        <p
          role="alert"
          className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {state === "notfound"
            ? t("account.orders.notFound")
            : t("account.orders.loadFailed")}
        </p>
        <div className="mt-6">{backLink}</div>
      </AccountShell>
    );
  }

  const money = (amount: number) =>
    convertToLocale({
      amount,
      currencyCode: order.currency_code,
      locale,
    });
  const address = order.shipping_address;

  return (
    <AccountShell
      locale={locale}
      active="orders"
      heading={
        <span className="flex flex-wrap items-center gap-4">
          {t("account.orders.orderNo", { id: String(order.display_id) })}
          {order.payment_status ? (
            <OrderStatus locale={locale} status={order.payment_status} />
          ) : null}
          {order.fulfillment_status ? (
            <OrderStatus locale={locale} status={order.fulfillment_status} />
          ) : null}
          {!order.payment_status && !order.fulfillment_status && (
            <OrderStatus locale={locale} status={order.status} />
          )}
        </span>
      }
    >
      {backLink}

      <p className="mt-6 text-ink/60">
        {t("account.orders.orderDate")}: {formatDate(order.created_at, locale)}
      </p>

      <ul className="mt-8 divide-y divide-line border-y border-line">
        {order.items.map((item) => {
          const media = resolveOrderItemMedia(item);
          return (
            <li key={item.id} className="flex gap-4 py-4">
              <div className="h-24 w-20 shrink-0 overflow-hidden border border-line bg-fog">
                {media.thumbnailUrl && (
                  <img
                    src={media.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{media.productTitle}</p>
                {media.variantTitle && (
                  <p className="mt-0.5 text-sm text-ink/60">
                    {media.variantTitle}
                  </p>
                )}
                <p className="mt-1 text-sm text-ink/60">
                  {t("account.orders.quantity")} × {item.quantity}
                </p>
              </div>
              <p className="whitespace-nowrap font-medium">
                {money(item.total)}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 w-full max-w-sm space-y-2 ml-auto">
        <div className="flex justify-between text-sm">
          <span className="text-ink/60">{t("account.orders.subtotal")}</span>
          <span>{money(order.item_total)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink/60">{t("account.orders.shipping")}</span>
          <span>{money(order.shipping_total)}</span>
        </div>
        {order.tax_total > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-ink/60">{t("account.orders.tax")}</span>
            <span>{money(order.tax_total)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-3 font-bold">
          <span>{t("account.orders.total")}</span>
          <span>{money(order.total)}</span>
        </div>
      </div>

      {address && (
        <div className="mt-10 border border-line p-6">
          <h2 className="text-sm font-bold">
            {t("account.orders.shippingTo")}
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            {[address.first_name, address.last_name].filter(Boolean).join(" ")}
          </p>
          <p className="text-sm text-ink/70">
            {formatAddressLines(address).join(", ")}
          </p>
          {address.phone && (
            <p className="text-sm text-ink/70">{address.phone}</p>
          )}
        </div>
      )}

      <TrackingBlock locale={locale} shipping={order.shipping ?? null} />
    </AccountShell>
  );
};

/** GoShip delivery block: phase badge, tracking number and timeline. */
const TrackingBlock = ({
  locale,
  shipping,
}: {
  locale: Locale;
  shipping: AccountOrderShipping | null;
}) => {
  const t = useTranslations(locale);
  if (!shipping) return null;

  const phase = shipping.phase || "pending";
  const phaseLabel = t(`account.orders.shipPhase.${phase}`);
  const phaseStyle = PHASE_STYLES[phase] ?? "bg-fog text-muted";

  return (
    <div className="mt-10 border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold">{t("account.orders.tracking")}</h2>
        <span
          className={`inline-block rounded-full px-3 py-1 text-xs whitespace-nowrap ${phaseStyle}`}
        >
          {phaseLabel}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex gap-2">
          <dt className="text-ink/60">{t("account.orders.carrier")}:</dt>
          <dd>{shipping.carrier ?? shipping.carrier_short_name ?? "—"}</dd>
        </div>
        {shipping.tracking_number && (
          <div className="flex gap-2">
            <dt className="text-ink/60">
              {t("account.orders.trackingNumber")}:
            </dt>
            <dd className="font-mono">{shipping.tracking_number}</dd>
          </div>
        )}
        {shipping.expected && (
          <div className="flex gap-2">
            <dt className="text-ink/60">
              {t("account.orders.expectedDelivery")}:
            </dt>
            <dd>{shipping.expected}</dd>
          </div>
        )}
      </dl>

      {shipping.tracking_url && (
        <a
          href={shipping.tracking_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-ink/70"
        >
          {t("account.orders.trackCta")} →
        </a>
      )}

      {shipping.timeline.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-bold">{t("account.orders.timeline")}</h3>
          <ol className="mt-3 space-y-3 border-l border-line pl-4">
            {shipping.timeline.map((event, index) => (
              <li key={`${event.status}-${event.update_time ?? index}`}>
                <p className="text-sm font-medium">
                  {event.status_text || event.description || event.status}
                </p>
                {event.status_text && event.description && (
                  <p className="text-xs text-ink/60">{event.description}</p>
                )}
                {event.update_time != null && (
                  <p className="text-xs text-ink/50">
                    {formatEventTime(event.update_time, locale)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink/60">
          {shipping.status_text
            ? `${t("account.orders.shipStatus")}: ${shipping.status_text}`
            : t("account.orders.noTracking")}
        </p>
      )}
    </div>
  );
};
