import { isEmpty } from "./is-empty";

type ConvertToLocaleParams = {
  amount: number;
  currencyCode: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
};

export const convertToLocale = ({
  amount,
  currencyCode,
  minimumFractionDigits,
  maximumFractionDigits,
  locale,
}: ConvertToLocaleParams) => {
  // Vietnamese Dong is formatted with Vietnamese grouping so the store reads
  // "490.000 ₫" rather than "₫490,000"; every other currency stays en-US.
  const bcp47 =
    locale ?? (currencyCode?.toLowerCase() === "vnd" ? "vi-VN" : "en-US");

  return currencyCode && !isEmpty(currencyCode)
    ? new Intl.NumberFormat(bcp47, {
        style: "currency",
        currency: currencyCode,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString();
};
