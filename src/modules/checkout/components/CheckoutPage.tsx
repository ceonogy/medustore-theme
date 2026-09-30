import { $cart } from "@lib/stores/cart";
import { useStore } from "@nanostores/react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState } from "react";
import { localizePath, useTranslations, type Locale } from "@i18n";
import { type RegionCountry } from "./AddressFields";
import { DeliveryStep } from "./DeliveryStep";
import { OrderSummary } from "./OrderSummary";
import { PaymentStep } from "./PaymentStep";
import { ShippingAddressStep } from "./ShippingAddressStep";

interface CheckoutPageProps {
  locale: Locale;
  countryCode: string;
  countries: RegionCountry[];
}

type CheckoutStep = "address" | "delivery" | "payment";

const VALID_STEPS: CheckoutStep[] = ["address", "delivery", "payment"];

const stripePromise = import.meta.env.PUBLIC_STRIPE_KEY
  ? loadStripe(import.meta.env.PUBLIC_STRIPE_KEY)
  : null;

function readStepFromUrl(): CheckoutStep {
  const params = new URLSearchParams(window.location.search);
  const s = params.get("step");
  return VALID_STEPS.includes(s as CheckoutStep)
    ? (s as CheckoutStep)
    : "address";
}

function validateStep(
  step: CheckoutStep,
  cart: NonNullable<ReturnType<typeof $cart.get>>,
): CheckoutStep {
  const hasAddress = Boolean(cart.shipping_address?.first_name);
  const hasShippingMethod = Boolean(cart.shipping_methods?.length);

  if (step === "delivery" && !hasAddress) return "address";
  if (step === "payment" && !hasAddress) return "address";
  if (step === "payment" && !hasShippingMethod) return "delivery";
  return step;
}

export const CheckoutPage = ({
  locale,
  countryCode,
  countries,
}: CheckoutPageProps) => {
  const t = useTranslations(locale);
  const cart = useStore($cart);
  const [, setSearch] = useState(() =>
    typeof window !== "undefined" ? window.location.search : "",
  );

  useEffect(() => {
    const onPopState = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToStep = (next: CheckoutStep) => {
    const url = new URL(window.location.href);
    url.searchParams.set("step", next);
    history.pushState(null, "", url.toString());
    setSearch(url.search);
  };

  const step = cart ? validateStep(readStepFromUrl(), cart) : "address";

  if (!cart || !cart.items?.length) {
    return (
      <div className="wrap py-16 text-center">
        <h1 className="text-3xl font-bold mb-4">
          {t("checkout.page.emptyCartTitle")}
        </h1>
        <p className="text-gray-600 mb-6">{t("checkout.page.emptyCartText")}</p>
        <a
          href={localizePath(locale, "/store")}
          className="inline-block bg-black text-white py-3 px-8 rounded-md hover:bg-gray-800 transition-colors"
        >
          {t("checkout.page.continueShopping")}
        </a>
      </div>
    );
  }

  const stripeSession = cart.payment_collection?.payment_sessions?.find((s) =>
    s.provider_id?.startsWith("pp_stripe_"),
  );
  const stripeClientSecret = stripeSession?.data?.client_secret as
    | string
    | undefined;

  const checkoutContent = (
    <div className="wrap py-8">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-0">
          <ShippingAddressStep
            cart={cart}
            locale={locale}
            countries={countries}
            countryCode={countryCode}
            mode={step === "address" ? "edit" : "read"}
            onContinue={() => goToStep("delivery")}
            onEdit={() => goToStep("address")}
          />

          <DeliveryStep
            cart={cart}
            locale={locale}
            mode={
              step === "delivery"
                ? "edit"
                : step === "address"
                  ? "inactive"
                  : "read"
            }
            onContinue={() => goToStep("payment")}
            onEdit={() => goToStep("delivery")}
          />

          <PaymentStep
            cart={cart}
            locale={locale}
            mode={step === "payment" ? "edit" : "inactive"}
          />
        </div>

        <div className="lg:col-span-1">
          <OrderSummary cart={cart} locale={locale} />
        </div>
      </div>
    </div>
  );

  return (
    <Elements
      key={stripeClientSecret ?? "no-stripe"}
      stripe={stripePromise}
      options={
        stripeClientSecret ? { clientSecret: stripeClientSecret } : undefined
      }
    >
      {checkoutContent}
    </Elements>
  );
};
