import {
  localizePath,
  useTranslations,
  type Locale,
  type Translator,
} from "@i18n";
import { convertToLocale } from "@lib/utils/money";
import { resolveLineItemMedia } from "@lib/utils/line-item";
import type { StoreCart } from "@medusajs/types";
import { useEffect, useState } from "react";

interface ConfirmedFallbackPageProps {
  locale: Locale;
}

function formatProviderName(providerId: string, t: Translator): string {
  if (providerId === "pp_system_default") return t("order.manualPayment");
  return providerId
    .replace(/^pp_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const ConfirmedFallbackPage = ({
  locale,
}: ConfirmedFallbackPageProps) => {
  const t = useTranslations(locale);
  const [cart, setCart] = useState<StoreCart | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("medusa_cart_snapshot");
      if (raw) {
        setCart(JSON.parse(raw));
        sessionStorage.removeItem("medusa_cart_snapshot");
      }
    } catch {}
  }, []);

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
                    {cart.shipping_address.postal_code},{" "}
                    {cart.shipping_address.city}
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
                      {cart.billing_address.postal_code},{" "}
                      {cart.billing_address.city}
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
