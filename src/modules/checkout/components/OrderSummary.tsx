import { convertToLocale } from "@lib/utils/money";
import { resolveLineItemMedia } from "@lib/utils/line-item";
import type { StoreCart } from "@medusajs/types";
import { useTranslations, type Locale } from "@i18n";

interface OrderSummaryProps {
  cart: StoreCart;
  locale: Locale;
}

export const OrderSummary = ({ cart, locale }: OrderSummaryProps) => {
  const t = useTranslations(locale);
  const currencyCode = cart.currency_code || "USD";

  return (
    <div className="sticky top-8">
      <h2 className="text-2xl font-bold mb-6">{t("checkout.summary.title")}</h2>

      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {t("checkout.summary.subtotal")}
          </span>
          <span>
            {convertToLocale({ amount: cart.item_subtotal || 0, currencyCode })}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {t("checkout.summary.shipping")}
          </span>
          <span>
            {convertToLocale({
              amount: cart.shipping_total || 0,
              currencyCode,
            })}
          </span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{t("checkout.summary.taxes")}</span>
          <span>
            {convertToLocale({ amount: cart.tax_total || 0, currencyCode })}
          </span>
        </div>

        <div className="pt-4 border-t border-gray-200 flex justify-between font-bold text-base">
          <span>{t("checkout.summary.total")}</span>
          <span>
            {convertToLocale({ amount: cart.total || 0, currencyCode })}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-4">
        {cart.items?.map((item) => {
          const media = resolveLineItemMedia(item);
          const thumbnailUrl = media.thumbnailUrl;
          const productTitle =
            media.productTitle || t("checkout.summary.productFallback");
          const variantTitle = media.variantTitle || "";
          const unitPrice = item.unit_price || 0;
          const quantity = item.quantity || 1;
          const lineTotal = unitPrice * quantity;

          return (
            <div key={item.id} className="flex gap-3">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={productTitle}
                  className="w-14 h-14 object-cover rounded border border-gray-200 flex-shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{productTitle}</p>
                {variantTitle && (
                  <p className="text-xs text-gray-500">
                    {t("checkout.summary.variant", { variant: variantTitle })}
                  </p>
                )}
                <div className="flex justify-between mt-1 text-sm">
                  <span className="text-gray-500">
                    {quantity}x{" "}
                    {convertToLocale({ amount: unitPrice, currencyCode })}
                  </span>
                  <span className="font-medium">
                    {convertToLocale({ amount: lineTotal, currencyCode })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
