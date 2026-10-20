import { localizePath, useTranslations, type Locale } from "@i18n";
import {
  listOrders,
  resolveOrderItemMedia,
  type AccountOrder,
} from "@lib/account-orders";
import { convertToLocale } from "@lib/utils/money";
import { useEffect, useState } from "react";
import { AccountShell } from "./AccountShell";
import { OrderStatus } from "./OrderStatus";

interface OrderListProps {
  locale: Locale;
  /** Login URL (with ?next=) for unauthenticated visitors. */
  loginPath: string;
}

const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/**
 * The customer's order history. 401/403 from the API bounces to login with
 * `?next=`; other failures render an inline error instead of a blank page.
 */
export const OrderList = ({ locale, loginPath }: OrderListProps) => {
  const t = useTranslations(locale);
  const [orders, setOrders] = useState<AccountOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listOrders()
      .then((list) => {
        if (active) setOrders(list);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) {
          window.location.assign(loginPath);
          return;
        }
        setFailed(true);
        setOrders([]);
      });
    return () => {
      active = false;
    };
  }, [loginPath]);

  if (orders === null) {
    return (
      <section className="wrap flex min-h-[40vh] items-center justify-center py-16">
        <p className="text-ink/60" aria-busy="true">
          {t("account.orders.loading")}
        </p>
      </section>
    );
  }

  return (
    <AccountShell
      locale={locale}
      heading={t("account.orders.title")}
      active="orders"
    >
      {failed && (
        <p
          role="alert"
          className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {t("account.orders.loadFailed")}
        </p>
      )}

      {!failed && orders.length === 0 && (
        <div className="mt-10 space-y-6">
          <p className="text-ink/70">{t("account.orders.empty")}</p>
          <a href={localizePath(locale, "/store")} className="btn">
            {t("account.orders.shopCta")}
          </a>
        </div>
      )}

      {orders.length > 0 && (
        <ul className="mt-8 space-y-4">
          {orders.map((order) => {
            const first = order.items[0];
            const media = first ? resolveOrderItemMedia(first) : null;
            return (
              <li key={order.id}>
                <a
                  href={localizePath(locale, `/tai-khoan/don-hang/${order.id}`)}
                  className="flex items-center gap-4 border border-line p-4 transition-colors hover:border-ink/40"
                >
                  <div className="h-20 w-16 shrink-0 overflow-hidden border border-line bg-fog">
                    {media?.thumbnailUrl && (
                      <img
                        src={media.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <p className="font-bold">
                        {t("account.orders.orderNo", {
                          id: String(order.display_id),
                        })}
                      </p>
                      <OrderStatus locale={locale} status={order.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink/60">
                      {formatDate(order.created_at, locale)} ·{" "}
                      {t("account.orders.itemsCount", {
                        count: order.items.length,
                      })}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-bold">
                    {convertToLocale({
                      amount: order.total,
                      currencyCode: order.currency_code,
                      locale,
                    })}
                  </p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
};
