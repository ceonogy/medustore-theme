import {
  localizePath,
  useTranslations,
  type Locale,
  type Translator,
} from "@i18n";
import { sdk } from "@lib/sdk";
import { formatLocality } from "@lib/utils/address";
import { convertToLocale } from "@lib/utils/money";
import { resolveLineItemMedia } from "@lib/utils/line-item";
import type { StoreCart } from "@medusajs/types";
import { useCallback, useEffect, useRef, useState } from "react";

interface ConfirmedFallbackPageProps {
  locale: Locale;
}

interface SePayPayment {
  provider_id: string;
  display_id: number | null;
  order_code: string | null;
  va_number: string | null;
  qr_code_url: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  amount: number | null;
  expires_at: string | null;
  captured: boolean;
  captured_at: string | null;
  collection_status: string | null;
}

const SEPAY_POLL_MS = 5000;

function formatProviderName(providerId: string, t: Translator): string {
  if (providerId === "pp_system_default") return t("order.manualPayment");
  if (providerId === "pp_sepay") return t("checkout.payment.sepayName");
  return providerId
    .replace(/^pp_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Đọc order id từ ?order= (ưu tiên) hoặc sessionStorage do checkout ghi lại. */
function readOrderId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("order");
    if (fromUrl) return fromUrl;
  } catch {}
  try {
    return sessionStorage.getItem("medusa_last_order_id");
  } catch {
    return null;
  }
}

/** `2026-10-31 03:44:35` (giờ VN) → `31/10/2026 03:44`. */
function formatExpiry(value: string): string {
  const d = new Date(value.replace(" ", "T") + "+07:00");
  if (Number.isNaN(d.getTime())) return value;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

/** VA/QR đã hết hạn (giờ VN, không TZ) và chưa thu tiền. */
function isPaymentExpired(payment: SePayPayment | null): boolean {
  if (!payment || payment.captured || !payment.expires_at) return false;
  const ms = Date.parse(payment.expires_at.replace(" ", "T") + "+07:00");
  return !Number.isNaN(ms) && ms <= Date.now();
}

/** Hàng "nhãn — giá trị" kèm nút sao chép. */
function TransferRow({
  label,
  value,
  copyLabel,
  copiedLabel,
  onCopy,
  copied,
  mono,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  onCopy: (value: string) => void;
  copied: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-sm ${mono ? "font-mono" : ""} break-all`}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onCopy(value)}
        className="shrink-0 text-xs border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}

export const ConfirmedFallbackPage = ({
  locale,
}: ConfirmedFallbackPageProps) => {
  const t = useTranslations(locale);
  const [cart, setCart] = useState<StoreCart | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sepay, setSepay] = useState<SePayPayment | null>(null);
  const [sepayError, setSepayError] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<"none" | "ok" | "error">(
    "none",
  );
  const [reloadKey, setReloadKey] = useState(0);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("medusa_cart_snapshot");
      if (raw) {
        setCart(JSON.parse(raw));
        sessionStorage.removeItem("medusa_cart_snapshot");
      }
    } catch {}
    setOrderId(readOrderId());
  }, []);

  // Tải thông tin chuyển khoản SePay và poll cho tới khi nhận đủ tiền.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await sdk.client.fetch<{ payment: SePayPayment | null }>(
          `/store/sepay/order/${orderId}`,
        );
        if (cancelled) return;
        setSepay(res.payment);
        setSepayError(false);
        // Ngừng poll khi đã thu tiền hoặc VA hết hạn (chờ khách tạo mã mới).
        if (
          (res.payment?.captured || isPaymentExpired(res.payment)) &&
          pollRef.current !== null
        ) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load SePay payment info:", err);
          setSepayError(true);
        }
      }
    };

    void load();
    pollRef.current = window.setInterval(load, SEPAY_POLL_MS);
    return () => {
      cancelled = true;
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [orderId, reloadKey]);

  /** Tạo VA/QR mới khi VA cũ hết hạn rồi tải lại + poll tiếp. */
  const regenerate = useCallback(async () => {
    if (!orderId) return;
    setRegenerating(true);
    setRegenMessage("none");
    try {
      const res = await sdk.client.fetch<{
        regenerated: boolean;
        payment_updated: SePayPayment | null;
      }>(`/store/sepay/order/${orderId}/refresh`, { method: "POST" });
      if (res.payment_updated) setSepay(res.payment_updated);
      if (res.regenerated) setRegenMessage("ok");
      // Khởi động lại effect: tải dữ liệu mới + poll VA mới.
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to regenerate SePay VA:", err);
      setRegenMessage("error");
    } finally {
      setRegenerating(false);
    }
  }, [orderId]);

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(value);
      window.setTimeout(
        () => setCopiedKey((k) => (k === value ? null : k)),
        1500,
      );
    } catch {}
  }, []);

  const renderRow = (label: string, value: string, mono = false) => (
    <TransferRow
      label={label}
      value={value}
      copyLabel={t("order.sepay.copy")}
      copiedLabel={t("order.sepay.copied")}
      onCopy={copy}
      copied={copiedKey === value}
      mono={mono}
    />
  );

  const currency = cart?.currency_code ?? "usd";
  const paymentProviderId =
    cart?.payment_collection?.payment_sessions?.[0]?.provider_id;
  const shippingMethod = cart?.shipping_methods?.[0];
  const sameAddress =
    cart?.shipping_address &&
    cart?.billing_address &&
    cart.shipping_address.address_1 === cart.billing_address.address_1 &&
    cart.shipping_address.postal_code === cart.billing_address.postal_code;

  return (
    <main
      className="mx-auto max-w-2xl px-4 py-16 tablet:px-6"
      aria-label={t("order.confirmation")}
    >
      {/* Success header */}
      <div className="text-center mb-12">
        <div
          className="inline-flex items-center justify-center w-16 h-16 bg-black rounded-full mb-6"
          aria-hidden="true"
        >
          <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="text-4xl font-bold mb-3">{t("order.thankYou")}</h1>

        <p className="text-sm text-gray-500">
          {t("order.placed")}
          {cart?.email && (
            <>
              {" "}
              {t("order.confirmationEmail")}{" "}
              <span className="font-medium text-gray-700">{cart.email}</span>
            </>
          )}
        </p>
      </div>

      {/* SePay bank transfer: QR + VA + poll trạng thái */}
      {sepay && !sepay.captured && (
        <section aria-labelledby="sepay-heading" className="mb-8">
          <h2 id="sepay-heading" className="text-lg font-semibold mb-4">
            {t("order.sepay.title")}
          </h2>
          <div className="border border-gray-200 rounded-md p-4 tablet:p-6">
            {isPaymentExpired(sepay) ? (
              <>
                <p className="text-sm text-orange-700 mb-4">
                  {t("order.sepay.expired")}
                </p>
                {regenMessage === "ok" && (
                  <p className="text-sm text-green-700 mb-4">
                    {t("order.sepay.regenerated")}
                  </p>
                )}
                {regenMessage === "error" && (
                  <p className="text-sm text-red-600 mb-4">
                    {t("order.sepay.regenerateFailed")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={regenerating}
                  className="inline-block bg-black text-white py-2.5 px-6 rounded-md text-sm hover:bg-gray-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {regenerating
                    ? t("order.sepay.regenerating")
                    : t("order.sepay.regenerate")}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  {t("order.sepay.instruction")}
                </p>

                {sepay.qr_code_url && (
                  <img
                    src={sepay.qr_code_url}
                    alt={t("order.sepay.qrAlt")}
                    width={224}
                    height={224}
                    className="mx-auto mb-4 w-56 h-56 border border-gray-200 rounded"
                  />
                )}

                <div className="divide-y divide-gray-100">
                  {sepay.bank_name &&
                    renderRow(t("order.sepay.bankLabel"), sepay.bank_name)}
                  {sepay.va_number &&
                    renderRow(t("order.sepay.vaLabel"), sepay.va_number, true)}
                  {sepay.account_holder_name &&
                    renderRow(
                      t("order.sepay.holderLabel"),
                      sepay.account_holder_name,
                    )}
                  {sepay.amount != null &&
                    renderRow(
                      t("order.sepay.amountLabel"),
                      // SePay chỉ hỗ trợ VND; luôn định dạng VND kể cả khi không
                      // còn cart snapshot (khách mở lại link trực tiếp).
                      convertToLocale({
                        amount: sepay.amount,
                        currencyCode: "vnd",
                      }),
                    )}
                  {sepay.order_code &&
                    renderRow(
                      t("order.sepay.contentLabel"),
                      sepay.order_code,
                      true,
                    )}
                </div>

                {sepay.expires_at && (
                  <p className="text-xs text-gray-500 mt-3">
                    {t("order.sepay.expires", {
                      time: formatExpiry(sepay.expires_at),
                    })}
                  </p>
                )}

                <p className="flex items-center gap-2 text-sm text-orange-600 mt-4">
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse"
                    aria-hidden="true"
                  />
                  {t("order.sepay.waiting")}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {sepay?.captured && (
        <div className="mb-8 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <svg
            className="w-5 h-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("order.sepay.paid")}
        </div>
      )}

      {sepayError && !sepay && (
        <p className="mb-8 text-sm text-gray-500">
          {t("order.sepay.loadFailed")}
        </p>
      )}

      {cart && (
        <>
          {/* Order items */}
          <section aria-labelledby="items-heading" className="mb-8">
            <h2 id="items-heading" className="text-lg font-semibold mb-4">
              {t("order.items")}
            </h2>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden">
              {cart.items?.map((item) => {
                // The cart API collapses variant.product to { id }, so media
                // comes from the line-item snapshot fields (shared helper).
                const media = resolveLineItemMedia(item);
                const thumbnailUrl = media.thumbnailUrl;

                const lineTotal = (item.unit_price ?? 0) * (item.quantity ?? 1);
                return (
                  <div key={item.id} className="flex gap-4 p-4">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={media.productTitle ?? item.title}
                        className="w-16 h-16 object-cover rounded border border-gray-200 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {media.productTitle ?? item.title}
                      </p>
                      {(media.variantTitle ?? item.variant_title) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {media.variantTitle ?? item.variant_title}
                        </p>
                      )}
                      <div className="flex justify-between mt-2 text-sm">
                        <span className="text-gray-500">
                          {item.quantity} ×{" "}
                          {convertToLocale({
                            amount: item.unit_price ?? 0,
                            currencyCode: currency,
                          })}
                        </span>
                        <span className="font-medium">
                          {convertToLocale({
                            amount: lineTotal,
                            currencyCode: currency,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Order summary */}
          <section aria-labelledby="summary-heading" className="mb-8">
            <h2 id="summary-heading" className="text-lg font-semibold mb-4">
              {t("order.summary")}
            </h2>
            <div className="border border-gray-200 rounded-md p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{t("order.subtotal")}</span>
                <span>
                  {convertToLocale({
                    amount: cart.subtotal ?? 0,
                    currencyCode: currency,
                  })}
                </span>
              </div>

              {shippingMethod && (
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {t("order.shipping", { name: shippingMethod.name })}
                  </span>
                  <span>
                    {convertToLocale({
                      amount: cart.shipping_total ?? 0,
                      currencyCode: currency,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-gray-600">{t("order.taxes")}</span>
                <span>
                  {convertToLocale({
                    amount: cart.tax_total ?? 0,
                    currencyCode: currency,
                  })}
                </span>
              </div>

              {(cart.discount_total ?? 0) > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>{t("order.discount")}</span>
                  <span>
                    −
                    {convertToLocale({
                      amount: cart.discount_total ?? 0,
                      currencyCode: currency,
                    })}
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-gray-200 flex justify-between font-bold text-base">
                <span>{t("order.total")}</span>
                <span>
                  {convertToLocale({
                    amount: cart.total ?? 0,
                    currencyCode: currency,
                  })}
                </span>
              </div>
            </div>
          </section>

          {/* Delivery & payment */}
          <section aria-labelledby="delivery-heading" className="mb-8">
            <h2 id="delivery-heading" className="text-lg font-semibold mb-4">
              {t("order.deliveryPayment")}
            </h2>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 text-sm">
              {cart.shipping_address && (
                <div className="p-4">
                  <p className="font-medium mb-1">
                    {t("order.shippingAddress")}
                  </p>
                  <address className="text-gray-600 not-italic leading-relaxed">
                    {cart.shipping_address.first_name}{" "}
                    {cart.shipping_address.last_name}
                    <br />
                    {cart.shipping_address.address_1}
                    {cart.shipping_address.address_2 && (
                      <>
                        <br />
                        {cart.shipping_address.address_2}
                      </>
                    )}
                    <br />
                    {formatLocality(cart.shipping_address)}
                  </address>
                </div>
              )}

              {cart.billing_address && (
                <div className="p-4">
                  <p className="font-medium mb-1">
                    {t("order.billingAddress")}
                  </p>
                  {sameAddress ? (
                    <p className="text-gray-600">{t("order.sameAsShipping")}</p>
                  ) : (
                    <address className="text-gray-600 not-italic leading-relaxed">
                      {cart.billing_address.first_name}{" "}
                      {cart.billing_address.last_name}
                      <br />
                      {cart.billing_address.address_1}
                      <br />
                      {formatLocality(cart.billing_address)}
                    </address>
                  )}
                </div>
              )}

              {paymentProviderId && (
                <div className="p-4">
                  <p className="font-medium mb-1">{t("order.payment")}</p>
                  <p className="text-gray-600">
                    {formatProviderName(paymentProviderId, t)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* What's next */}
          <section aria-labelledby="next-heading" className="mb-10">
            <h2 id="next-heading" className="text-lg font-semibold mb-4">
              {t("order.nextSteps")}
            </h2>
            <ol className="space-y-3 text-sm text-gray-600">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-semibold flex items-center justify-center text-xs">
                  1
                </span>
                <span>
                  <strong className="text-gray-900">
                    {t("order.processing")}
                  </strong>
                  {" — "}
                  {t("order.processingText")}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-semibold flex items-center justify-center text-xs">
                  2
                </span>
                <span>
                  <strong className="text-gray-900">
                    {t("order.shipmentNotification")}
                  </strong>
                  {" — "}
                  {t("order.shipmentNotificationText")}
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-700 font-semibold flex items-center justify-center text-xs">
                  3
                </span>
                <span>
                  <strong className="text-gray-900">
                    {t("order.delivery")}
                  </strong>
                  {" — "}
                  {t("order.deliveryText")}
                </span>
              </li>
            </ol>
          </section>
        </>
      )}

      {/* CTA */}
      <div className="text-center">
        <a
          href={localizePath(locale, "/store")}
          className="inline-block bg-black text-white py-3 px-10 rounded-md hover:bg-gray-800 transition-colors"
        >
          {t("order.continueShopping")}
        </a>
      </div>
    </main>
  );
};
