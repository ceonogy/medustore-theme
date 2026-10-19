import { localizePath, useTranslations, type Locale } from "@i18n";
import {
  $cart,
  $isCartSidebarOpen,
  closeCartSidebar,
  removeFromCart,
} from "@lib/stores/cart";
import { convertToLocale } from "@lib/utils/money";
import { resolveLineItemMedia } from "@lib/utils/line-item";
import { useStore } from "@nanostores/react";
import { useEffect, useRef } from "react";
import { useHydrated } from "@lib/hooks/use-hydrated";

interface CartSidebarProps {
  locale: Locale;
}

export const CartSidebar = ({ locale }: CartSidebarProps) => {
  const cart = useStore($cart);
  // Hydration gate — first client render must match the SSR (empty) HTML;
  // see useHydrated for the ClientRouter/#418 background.
  const hydrated = useHydrated();
  const displayedCart = hydrated ? cart : null;
  const isOpen = useStore($isCartSidebarOpen);
  // Same gate for the open state: a drawer left open by the previous page
  // must not un-hide itself while hydrating the next page's SSR (closed) HTML.
  const displayedOpen = hydrated && isOpen;
  const sidebarRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const t = useTranslations(locale);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeCartSidebar();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Removing the page scrollbar would widen the layout (CLS): lock the
      // scroll and compensate with the exact gutter width just lost — same
      // as the filter drawer.
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && sidebarRef.current) {
      const firstFocusable = sidebarRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) as HTMLElement;
      firstFocusable?.focus();
    }
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      closeCartSidebar();
    }
  };

  const handleRemoveItem = async (lineItemId: string) => {
    try {
      await removeFromCart(lineItemId);
    } catch (error) {
      console.error("Failed to remove item:", error);
    }
  };

  const itemCount = displayedCart?.items?.length ?? 0;
  const isEmpty = itemCount === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className={`fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300 ${
          displayedOpen ? "opacity-50" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("cart.shoppingCartAria")}
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-xl transform transition-transform duration-300 ease-in-out ${
          displayedOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold">{t("cart.title")}</h2>
            <button
              onClick={closeCartSidebar}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              aria-label={t("cart.close")}
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-gray-500 mb-4">{t("cart.empty")}</p>
                <a
                  href={localizePath(locale, "/store")}
                  onClick={closeCartSidebar}
                  className="text-sm text-ink hover:underline"
                >
                  {t("cart.continueShopping")}
                </a>
              </div>
            ) : (
              <div className="space-y-6">
                {displayedCart?.items?.map((item) => {
                  const media = resolveLineItemMedia(item);
                  const thumbnailUrl = media.thumbnailUrl;
                  const productTitle =
                    media.productTitle || t("cart.productFallback");
                  const variantTitle = media.variantTitle || "";
                  const unitPrice = item.unit_price || 0;
                  const currencyCode = displayedCart.currency_code || "USD";

                  return (
                    <div
                      key={item.id}
                      className="flex gap-4 pb-6 border-b border-gray-100 last:border-0"
                    >
                      {/* Thumbnail - matches ImageCarousel thumb pattern (144x144) */}
                      {thumbnailUrl && (
                        <img
                          src={thumbnailUrl}
                          alt={productTitle}
                          width={144}
                          height={144}
                          className="w-16 h-16 aspect-square object-cover rounded"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      )}

                      {/* Item details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm mb-1 truncate">
                          {productTitle}
                        </h3>
                        {variantTitle && (
                          <p className="text-xs text-gray-500 mb-1">
                            {t("cart.variant", { title: variantTitle })}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mb-2">
                          {t("cart.quantityLabel", { count: item.quantity })}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            {convertToLocale({
                              amount: unitPrice,
                              currencyCode,
                            })}
                          </p>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                            aria-label={t("cart.removeItemAria", {
                              title: productTitle,
                            })}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                            {t("cart.remove")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {!isEmpty && (
            <div className="border-t border-gray-200 p-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {t("cart.subtotalExclTaxes")}
                </span>
                <span className="font-medium">
                  {convertToLocale({
                    amount: displayedCart?.item_subtotal || 0,
                    currencyCode: displayedCart?.currency_code || "USD",
                  })}
                </span>
              </div>
              <a
                href={localizePath(locale, "/cart")}
                onClick={closeCartSidebar}
                className="block w-full bg-black text-white py-3 px-6 rounded-md text-center hover:bg-gray-800 transition-colors"
              >
                {t("cart.goToCart")}
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
