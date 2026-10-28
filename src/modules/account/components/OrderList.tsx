import { localizePath, useTranslations, type Locale } from "@i18n";
import {
  listOrders,
  resolveOrderItemMedia,
  type AccountOrder,
} from "@lib/account-orders";
import { convertToLocale } from "@lib/utils/money";
import { useEffect, useRef, useState } from "react";
import { AccountShell } from "./AccountShell";
import { OrderStatus } from "./OrderStatus";

interface OrderListProps {
  locale: Locale;
  /** Login URL (with ?next=) for unauthenticated visitors. */
  loginPath: string;
}

/** Orders per page; the API caps `take` at 100. */
const PAGE_SIZE = 30;

const formatDate = (iso: string, locale: Locale): string =>
  new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/** Start page from `?page=N` (SSR-safe → 1). */
const pageFromUrl = (): number => {
  if (typeof window === "undefined") return 1;
  const parsed = Number(
    new URLSearchParams(window.location.search).get("page"),
  );
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
};

/** Whole run when short, otherwise first · window · last (catalog parity). */
const pageNumbers = (page: number, pageCount: number): (number | "gap")[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const candidates = [1, page - 1, page, page + 1, pageCount]
    .filter((n) => n >= 1 && n <= pageCount)
    .filter((n, index, all) => all.indexOf(n) === index)
    .sort((a, b) => a - b);

  const numbers: (number | "gap")[] = [];
  candidates.forEach((number, index) => {
    const previous = candidates[index - 1];
    if (index > 0 && previous !== undefined && number - previous > 1) {
      numbers.push("gap");
    }
    numbers.push(number);
  });
  return numbers;
};

/**
 * The customer's order history, paginated (30/page) with numbered page
 * controls matching the catalog. The current page also lives in `?page=N`
 * so a refresh keeps the spot. 401/403 bounces to login with `?next=`;
 * other failures render an inline error instead of a blank page.
 */
export const OrderList = ({ locale, loginPath }: OrderListProps) => {
  const t = useTranslations(locale);
  const [page, setPage] = useState(pageFromUrl);
  const [rows, setRows] = useState<AccountOrder[] | null>(null);
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const pageCount = Math.ceil(count / PAGE_SIZE);

  useEffect(() => {
    let active = true;
    const start = (page - 1) * PAGE_SIZE;

    // The current page also lives in the URL — refresh keeps the spot.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (page > 1) url.searchParams.set("page", String(page));
      else url.searchParams.delete("page");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search,
      );
    }

    const done = () => {
      if (page > 1) {
        listTopRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    };

    setPageLoading(page > 1);
    setPageError(false);

    (async () => {
      try {
        const res = await listOrders({ take: PAGE_SIZE, skip: start });
        if (!active) return;

        // Deep link past the end (`?page=99`) — clamp instead of a blank
        // list pretending the customer has no orders.
        if (res.orders.length === 0 && page > 1) {
          setPage(Math.max(1, Math.ceil(res.count / PAGE_SIZE)));
          return;
        }
        setRows(res.orders);
        setCount(res.count);
        setFailed(false);
        done();
      } catch (error: unknown) {
        if (!active) return;
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) {
          window.location.assign(loginPath);
          return;
        }
        // Page 1 fails hard (nothing to show); a later page fails softly
        // so the already-loaded rows stay on screen.
        if (page > 1) {
          setPageError(true);
        } else {
          setFailed(true);
          setRows([]);
        }
      } finally {
        if (active) setPageLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [page, loginPath]);

  const goTo = (target: number) => {
    if (pageLoading || target === page) return;
    if (target < 1 || target > pageCount) return;
    setPage(target);
  };

  if (rows === null) {
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
      <div ref={listTopRef} className="scroll-mt-32">
        {failed && (
          <p
            role="alert"
            className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {t("account.orders.loadFailed")}
          </p>
        )}

        {!failed && rows.length === 0 && (
          <div className="mt-10 space-y-6">
            <p className="text-ink/70">{t("account.orders.empty")}</p>
            <a href={localizePath(locale, "/store")} className="btn">
              {t("account.orders.shopCta")}
            </a>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="mt-8 space-y-4">
            {rows.map((order) => {
              const first = order.items[0];
              const media = first ? resolveOrderItemMedia(first) : null;
              return (
                <li key={order.id}>
                  <a
                    href={localizePath(
                      locale,
                      `/tai-khoan/don-hang/${order.id}`,
                    )}
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

        {pageError && (
          <p
            role="alert"
            className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {t("account.orders.loadFailed")}
          </p>
        )}

        {pageCount > 1 && (
          <nav
            aria-label={t("products.pagination.label")}
            className="mt-10 flex flex-wrap items-center justify-center gap-2"
          >
            {page > 1 && (
              <button
                type="button"
                onClick={() => goTo(page - 1)}
                disabled={pageLoading}
                className="flex min-h-11 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("products.pagination.previous")}
              </button>
            )}

            {pageNumbers(page, pageCount).map((number, index) =>
              number === "gap" ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="px-1 text-sm text-gray-400"
                >
                  &hellip;
                </span>
              ) : (
                <button
                  key={number}
                  type="button"
                  onClick={() => goTo(number)}
                  disabled={pageLoading}
                  aria-current={number === page ? "page" : undefined}
                  aria-label={`${t("products.pagination.page")} ${number}`}
                  className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    number === page
                      ? "border-black bg-black text-white"
                      : "border-gray-300 text-black hover:bg-gray-100"
                  }`}
                >
                  {number}
                </button>
              ),
            )}

            {page < pageCount && (
              <button
                type="button"
                onClick={() => goTo(page + 1)}
                disabled={pageLoading}
                className="flex min-h-11 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("products.pagination.next")}
              </button>
            )}
          </nav>
        )}
      </div>
    </AccountShell>
  );
};
