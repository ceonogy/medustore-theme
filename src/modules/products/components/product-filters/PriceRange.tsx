import { useEffect, useRef, useState } from "react";
import { useTranslations, type Locale } from "@i18n";
import type { CatalogState } from "../../../../lib/utils/canonical-query";
import type { PriceBounds } from "../../../../lib/utils/catalog";
import { convertToLocale } from "../../../../lib/utils/money";
import {
  PRICE_STEP,
  clampPrice,
  initialRange,
  parsePriceInput,
  sliderBounds,
  withPrice,
  type PriceRangeValue,
} from "../../../../lib/utils/price-range";

interface PriceRangeProps {
  bounds: PriceBounds;
  /** Canonical state of the current URL — the slider starts from it. */
  state: CatalogState;
  /** Canonical URL (path + query) for a filter state. */
  hrefFor: (next: CatalogState) => string;
  locale?: Locale;
}

/** Typing and arrow keys settle after this pause; dragging commits on release. */
const COMMIT_DELAY = 450;

/** Which end the shopper last touched — a crossing handle moves the other one. */
type Side = "min" | "max" | "slider";

const formatPrice = (value: number): string =>
  convertToLocale({ amount: value, currencyCode: "VND" });

/** Grouped thousands for the input display ("450.000"). */
const formatNumber = (value: number): string => value.toLocaleString("vi-VN");

/**
 * The two-handle price filter.
 *
 * Every change navigates to the canonical URL, so results always come from
 * the server — this island never filters a client-side copy of the catalogue.
 * The track and the inputs are server-rendered with their final dimensions
 * (bounds arrive as props), so hydration shifts nothing.
 */
export const PriceRange = ({
  bounds,
  state,
  hrefFor,
  locale,
}: PriceRangeProps) => {
  const t = useTranslations(locale);
  const { low, high } = bounds ? sliderBounds(bounds) : { low: 0, high: 0 };

  const [draft, setDraft] = useState<PriceRangeValue>(() =>
    bounds ? initialRange(state, low, high) : { min: 0, max: 0 },
  );
  // The inputs display grouped thousands ("450.000"); parsePriceInput strips
  // the separators, so the URL always receives plain digits.
  const [minText, setMinText] = useState(() => formatNumber(draft.min));
  const [maxText, setMaxText] = useState(() => formatNumber(draft.max));

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ draft, minText, maxText });
  latest.current = { draft, minText, maxText };

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!bounds) return null;

  /** Navigates when the range actually changes the URL, and always snaps the
   *  inputs back to the values that were committed. */
  const commit = (range: PriceRangeValue, side: Side) => {
    clearTimeout(timer.current);

    let min = clampPrice(range.min, low, high);
    let max = clampPrice(range.max, low, high);
    // Typed values may cross; the edited end wins and the other follows it.
    if (side === "min") max = Math.max(max, min);
    if (side === "max") min = Math.min(min, max);

    const ordered = { min, max };
    setDraft(ordered);
    setMinText(formatNumber(ordered.min));
    setMaxText(formatNumber(ordered.max));

    const next = withPrice(state, ordered, low, high);
    if (
      next.price_min === state.price_min &&
      next.price_max === state.price_max
    ) {
      return;
    }
    window.location.assign(`${hrefFor(next)}`);
  };

  const schedule = (read: () => { range: PriceRangeValue; side: Side }) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const { range, side } = read();
      commit(range, side);
    }, COMMIT_DELAY);
  };

  const moveSlider = (side: "min" | "max", value: number) => {
    const current = latest.current.draft;
    const next =
      side === "min"
        ? { min: Math.min(value, current.max), max: current.max }
        : { min: current.min, max: Math.max(value, current.min) };

    setDraft(next);
    setMinText(formatNumber(next.min));
    setMaxText(formatNumber(next.max));
    schedule(() => ({ range: next, side: "slider" }));
  };

  const rangeFromText = (side: "min" | "max") => {
    const { minText: rawMin, maxText: rawMax, draft: current } = latest.current;
    return {
      range: {
        min: parsePriceInput(rawMin) ?? current.min,
        max: parsePriceInput(rawMax) ?? current.max,
      },
      side,
    };
  };

  const releaseHandle = () => commit(latest.current.draft, "slider");

  const digitsOnly = (value: string) => value.replace(/[^\d]/g, "");

  const pct = (value: number) =>
    high === low ? 0 : ((value - low) / (high - low)) * 100;

  const inputClass =
    "h-9 w-28 rounded-md border border-line px-3 text-sm focus:border-ink focus:outline-none";
  // Full class strings (variants included) so Tailwind's scanner sees them.
  const thumbClass =
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-md [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-paper [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-md [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-paper";

  return (
    <section
      aria-labelledby="filter-group-price"
      className="flex flex-col gap-3 border-t border-line px-5 py-4 tablet:flex-row tablet:gap-6"
    >
      <h3
        id="filter-group-price"
        className="type-kicker shrink-0 pt-1.5 text-muted tablet:w-32"
      >
        {t("products.filters.price")}
      </h3>

      <div className="min-w-0 flex-1">
        <div
          className="flex w-full max-w-md justify-between text-xs text-muted"
          aria-hidden="true"
        >
          <span>{formatPrice(low)}</span>
          <span>{formatPrice(high)}</span>
        </div>

        <div className="relative my-2 h-5 w-full max-w-md">
          <div
            className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line"
            aria-hidden="true"
          />
          <div
            className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-ink"
            style={{
              left: `${pct(draft.min)}%`,
              width: `${Math.max(pct(draft.max) - pct(draft.min), 0)}%`,
            }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={low}
            max={high}
            step={PRICE_STEP}
            value={draft.min}
            aria-label={t("products.filters.priceMin")}
            aria-valuetext={formatPrice(draft.min)}
            onChange={(event) => moveSlider("min", Number(event.target.value))}
            onPointerUp={releaseHandle}
            className={`pointer-events-none absolute inset-0 z-10 h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${thumbClass}`}
          />
          <input
            type="range"
            min={low}
            max={high}
            step={PRICE_STEP}
            value={draft.max}
            aria-label={t("products.filters.priceMax")}
            aria-valuetext={formatPrice(draft.max)}
            onChange={(event) => moveSlider("max", Number(event.target.value))}
            onPointerUp={releaseHandle}
            className={`pointer-events-none absolute inset-0 z-20 h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${thumbClass}`}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            min={low}
            max={high}
            value={minText}
            aria-label={t("products.filters.priceMin")}
            onChange={(event) => {
              const digits = digitsOnly(event.target.value);
              setMinText(digits ? formatNumber(Number(digits)) : "");
              schedule(() => rangeFromText("min"));
            }}
            onBlur={() => commit(rangeFromText("min").range, "min")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(rangeFromText("min").range, "min");
              }
            }}
            className={inputClass}
          />
          <span aria-hidden="true" className="text-muted">
            –
          </span>
          <input
            type="text"
            inputMode="numeric"
            min={low}
            max={high}
            value={maxText}
            aria-label={t("products.filters.priceMax")}
            onChange={(event) => {
              const digits = digitsOnly(event.target.value);
              setMaxText(digits ? formatNumber(Number(digits)) : "");
              schedule(() => rangeFromText("max"));
            }}
            onBlur={() => commit(rangeFromText("max").range, "max")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(rangeFromText("max").range, "max");
              }
            }}
            className={inputClass}
          />
          <span aria-hidden="true" className="text-xs text-muted">
            ₫
          </span>
        </div>
      </div>
    </section>
  );
};
