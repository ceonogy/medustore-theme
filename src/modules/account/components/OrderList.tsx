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

/** Orders per page; the API caps `take` at 100. */
const PAGE_SIZE = 30;

// ⚠️ TEMP (xóa sau khi test xong): nhân số dòng render lên N lần để kiểm tra
// layout danh sách dài (>30 rows) — không đụng dữ liệu thật. Đặt về 1.
const TEMP_RENDER_MULTIPLIER = 12;

const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/**
 * The customer's order history, paginated (30/page) with a "load more"
 * button when further pages exist. 401/403 from the API bounces to login
 * with `?next=`; other failures render an inline error instead of a blank
 * page.
 */
export const OrderList = ({ locale, loginPath }: OrderListProps) => {
  const t = useTranslations(locale);
  const [orders, setOrders] = useState<AccountOrder[] | null>(null);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // ⚠️ TEMP: extra render passes added by "load more" while testing.
  const [tempPasses, setTempPasses] = useState(0);

  useEffect(() => {
    let active = true;
    listOrders({ take: PAGE_SIZE })
      .then((page) => {
        if (!active) return;
        setOrders(page.orders);
        setCount(page.count);
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

  const onLoadMore = async () => {
    if (!orders) return;
    // ⚠️ TEMP: append another render pass instead of fetching (see multiplier).
    if (TEMP_RENDER_MULTIPLIER > 1) {
      setTempPasses((n) => n + 1);
      return;
    }
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await listOrders({ take: PAGE_SIZE, skip: orders.length });
      setOrders((prev) => {
        const seen = new Set((prev ?? []).map((o) => o.id));
        return [...(prev ?? []), ...page.orders.filter((o) => !seen.has(o.id))];
      });
      setCount(page.count);
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) {
        window.location.assign(loginPath);
        return;
      }
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (orders === null) {
    return (
      <section className="wrap flex min-h-[40vh] items-center justify-center py-16">
        <p className="text-ink/60" aria-busy="true">
          {t("account.orders.loading")}
        </p>
      </section>
    );
  }

  // ⚠️ TEMP: expand the real rows into N render passes for the long-list
  // layout test; keys stay unique per pass. Real mode renders 1:1.
  const renderRows =
    TEMP_RENDER_MULTIPLIER > 1
      ? Array.from({ length: TEMP_RENDER_MULTIPLIER + tempPasses }, (_, pass) =>
          orders.map((order) => ({ order, key: `${pass}-${order.id}` })),
        ).flat()
      : orders.map((order) => ({ order, key: order.id }));

  // In the temp test the real data is exhausted but more rows render, so the
  // button stays available; in real mode it only shows while pages remain.
  const showLoadMore =
    renderRows.length > 0 &&
    (TEMP_RENDER_MULTIPLIER > 1 || orders.length < count);

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
          {renderRows.map(({ order, key }) => {
            const first = order.items[0];
            const media = first ? resolveOrderItemMedia(first) : null;
            return (
              <li key={key}>
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

      {moreFailed && (
        <p
          role="alert"
          className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {t("account.orders.loadMoreFailed")}
        </p>
      )}

      {showLoadMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="btn disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loadingMore
              ? t("account.orders.loading")
              : t("account.orders.loadMore")}
          </button>
        </div>
      )}

      {!failed && orders.length > 0 && orders.length >= count && (
        <p className="mt-6 text-center text-sm text-ink/55">
          {t("account.orders.allLoaded", { count: orders.length })}
        </p>
      )}
    </AccountShell>
  );
};
