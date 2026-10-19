import { zodResolver } from "@hookform/resolvers/zod";
import { updateCartAddress } from "@lib/stores/cart";
import type { StoreCart } from "@medusajs/types";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslations, type Locale, type Translator } from "@i18n";
import {
  AddressFields,
  joinFullName,
  splitFullName,
  type AddressValues,
  type CheckoutFormValues,
  type RegionCountry,
} from "./AddressFields";

// Schemas are built per-render so validation messages follow the active locale.
const buildAddressSchema = (t: Translator) =>
  z.object({
    fullName: z.string().min(1, t("checkout.validation.fullNameRequired")),
    address: z.string().min(1, t("checkout.validation.addressRequired")),
    company: z.string(),
    province: z.string().min(1, t("checkout.validation.provinceRequired")),
    ward: z.string().min(1, t("checkout.validation.wardRequired")),
    postalCode: z.string(),
    country: z.string(),
  });

const buildFormSchema = (t: Translator) =>
  z.object({
    email: z
      .string()
      .min(1, t("checkout.validation.emailRequired"))
      .refine(
        (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
        t("checkout.validation.emailInvalid"),
      ),
    phone: z.string().trim().min(1, t("checkout.validation.phoneRequired")),
    shipping: buildAddressSchema(t),
  });

const EMPTY_ADDRESS: AddressValues = {
  fullName: "",
  address: "",
  company: "",
  province: "",
  ward: "",
  postalCode: "",
  country: "",
};

// Note: this Medusa version's cart API accepts `city` and `province` on
// addresses but silently drops `district` (probed directly) — the
// Vietnamese ward therefore lives in the `city` column.
function mapAddress(
  addr?: StoreCart["shipping_address"] | null,
): AddressValues {
  return {
    fullName: joinFullName(addr),
    address: addr?.address_1 ?? "",
    company: addr?.company ?? "",
    province: addr?.province ?? "",
    ward: addr?.city ?? "",
    postalCode: addr?.postal_code ?? "",
    country: addr?.country_code ?? "",
  };
}

interface ShippingAddressStepProps {
  cart: StoreCart | null;
  locale: Locale;
  countries: RegionCountry[];
  countryCode: string;
  mode: "edit" | "read";
  /** Which checkout step the shopper is on — drives the progress row. */
  activeStep: "address" | "delivery" | "payment";
  onContinue?: () => void;
  onEdit?: () => void;
}

/**
 * The three-step checkout progress ("01 Địa chỉ — 02 Giao hàng — 03 Thanh
 * toán") shown inside the shipping-address section, so the current stage
 * and the next step are always visible. Completed steps carry a check,
 * the active one is ink, upcoming ones muted.
 */
const StepProgress = ({
  locale,
  activeStep,
}: {
  locale: Locale;
  activeStep: "address" | "delivery" | "payment";
}) => {
  const t = useTranslations(locale);
  const steps = [
    { key: "address", label: t("checkout.stepper.address") },
    { key: "delivery", label: t("checkout.stepper.delivery") },
    { key: "payment", label: t("checkout.stepper.payment") },
  ];
  const active = Math.max(
    0,
    steps.findIndex((s) => s.key === activeStep),
  );

  return (
    <ol className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] uppercase tracking-[0.16em]">
      {steps.map((s, i) => {
        const state = i < active ? "done" : i === active ? "current" : "todo";
        return (
          <li
            key={s.key}
            className="flex items-center gap-3"
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              className={`flex items-center gap-1.5 ${
                state === "current"
                  ? "text-ink"
                  : state === "done"
                    ? "text-ink/60"
                    : "text-muted"
              }`}
            >
              <span className="tabular-nums">{`0${i + 1}`}</span>
              <span className={state === "current" ? "font-medium" : undefined}>
                {s.label}
              </span>
              {state === "done" && (
                <svg
                  viewBox="0 0 12 12"
                  fill="none"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="h-px w-6 bg-line" />
            )}
          </li>
        );
      })}
    </ol>
  );
};

const CheckCircle = () => (
  <span className="inline-flex items-center justify-center w-5 h-5 bg-black rounded-full shrink-0">
    <svg
      className="w-3 h-3 text-white"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 6l3 3 5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

const ReadOnlyView = ({
  cart,
  locale,
  activeStep,
  onEdit,
}: {
  cart: StoreCart;
  locale: Locale;
  activeStep: "address" | "delivery" | "payment";
  onEdit?: () => void;
}) => {
  const t = useTranslations(locale);
  const shipping = cart.shipping_address;

  const shippingLines = [
    joinFullName(shipping) || null,
    shipping?.address_1 ?? null,
    shipping?.city && shipping?.province
      ? `${shipping.city}, ${shipping.province}`
      : (shipping?.province ?? null),
  ].filter(Boolean) as string[];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          {t("checkout.shipping.title")}
          <CheckCircle />
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="text-ink hover:underline text-sm"
        >
          {t("checkout.shipping.edit")}
        </button>
      </div>

      <StepProgress locale={locale} activeStep={activeStep} />

      {/* Billing editing is temporarily removed, and the read-only
          note ("billing same as shipping") is hidden per spec — billing
          is always saved as a mirror of shipping, just not displayed. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-sm">
        <div>
          <p className="font-medium mb-2">{t("checkout.shipping.title")}</p>
          {shippingLines.map((line, i) => (
            <p key={i} className="text-gray-700">
              {line}
            </p>
          ))}
        </div>

        <div>
          <p className="font-medium mb-2">{t("checkout.shipping.contact")}</p>
          {cart.email && <p className="text-gray-700">{cart.email}</p>}
        </div>
      </div>
    </div>
  );
};

export const ShippingAddressStep = ({
  cart,
  locale,
  countries,
  countryCode,
  mode,
  activeStep,
  onContinue,
  onEdit,
}: ShippingAddressStepProps) => {
  const t = useTranslations(locale);
  const [submitError, setSubmitError] = useState("");
  const cartInitialized = useRef(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(buildFormSchema(t)),
    defaultValues: {
      email: "",
      phone: "",
      shipping: { ...EMPTY_ADDRESS, country: countryCode },
    },
  });

  // Populate form from saved cart address on first load / after refresh
  useEffect(() => {
    if (!cart || cartInitialized.current) return;
    cartInitialized.current = true;

    const shipping = cart.shipping_address;
    if (!shipping?.first_name) return; // No saved address yet, keep empty defaults

    reset({
      email: cart.email ?? "",
      phone: shipping.phone ?? "",
      shipping: {
        ...mapAddress(shipping),
        country: shipping.country_code || countryCode,
      },
    });
  }, [cart, reset, countryCode]);

  const provinceValue = watch("shipping.province");
  const wardValue = watch("shipping.ward");

  const onSubmit = async (data: CheckoutFormValues) => {
    setSubmitError("");
    try {
      const { first_name, last_name } = splitFullName(data.shipping.fullName);
      const address = {
        first_name,
        last_name,
        address_1: data.shipping.address,
        company: data.shipping.company || undefined,
        province: data.shipping.province,
        // The ward goes in `city`: this API version drops `district`.
        city: data.shipping.ward,
        postal_code: data.shipping.postalCode || undefined,
        country_code: data.shipping.country || countryCode,
        phone: data.phone || undefined,
      };

      await updateCartAddress({
        email: data.email,
        shipping_address: address,
        // The billing section is temporarily removed: billing always
        // mirrors shipping, saved with the same corrected fields.
        billing_address: { ...address },
      });

      onContinue?.();
    } catch (error) {
      console.error("Failed to update shipping address:", error);
      setSubmitError(t("checkout.shipping.saveFailed"));
    }
  };

  if (mode === "read" && cart) {
    return (
      <ReadOnlyView
        cart={cart}
        locale={locale}
        activeStep={activeStep}
        onEdit={onEdit}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <h2 className="text-2xl font-bold mb-4">
        {t("checkout.shipping.title")}
      </h2>

      <StepProgress locale={locale} activeStep={activeStep} />

      <div className="space-y-4">
        <AddressFields
          locale={locale}
          prefix="shipping"
          register={register}
          setValue={setValue}
          provinceValue={provinceValue}
          wardValue={wardValue}
          errors={errors.shipping ?? {}}
          countries={countries}
        />

        {/* Email / Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <input
              type="email"
              placeholder={t("checkout.shipping.email")}
              {...register("email")}
              className={`w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors ${
                errors.email ? "border-red-400" : "border-gray-300"
              }`}
            />
            <p className="text-red-500 text-xs mt-1 min-h-4">
              {errors.email?.message ?? ""}
            </p>
          </div>
          <div>
            <input
              type="tel"
              placeholder={t("checkout.shipping.phone")}
              {...register("phone")}
              className={`w-full border rounded px-4 py-3 text-sm outline-none focus:border-gray-500 transition-colors ${
                errors.phone ? "border-red-400" : "border-gray-300"
              }`}
            />
            <p className="text-red-500 text-xs mt-1 min-h-4">
              {errors.phone?.message ?? ""}
            </p>
          </div>
        </div>

        {submitError && <p className="text-red-500 text-sm">{submitError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="cursor-pointer bg-black text-white py-3 px-8 rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting
            ? t("checkout.shipping.saving")
            : t("checkout.shipping.continueToDelivery")}
        </button>
      </div>
    </form>
  );
};
