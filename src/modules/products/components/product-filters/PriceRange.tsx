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
  const [minText, setMinText] = useState(() => String(draft.min));
  const [maxText, setMaxText] = useState(() => String(draft.max));

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
    setMinText(String(ordered.min));
    setMaxText(String(ordered.max));

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
    setMinText(String(next.min));
    setMaxText(String(next.max));
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
    "h-11 w-28 rounded-full border border-gray-300 px-3 text-sm focus:border-black focus:outline-none";
  // Full class strings (variants included) so Tailwind's scanner sees them.
  const thumbClass =
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-black [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow";

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t("products.filters.price")}
      </legend>

      <div
        className="flex w-56 justify-between text-xs text-gray-500"
        aria-hidden="true"
      >
        <span>{formatPrice(low)}</span>
        <span>{formatPrice(high)}</span>
      </div>

      <div className="relative h-6 w-56">
        <div
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-200"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-black"
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
          className={`pointer-events-none absolute inset-0 z-10 h-6 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${thumbClass}`}
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
          className={`pointer-events-none absolute inset-0 z-20 h-6 w-full cursor-pointer appearance-none bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-black ${thumbClass}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={low}
          max={high}
          step={PRICE_STEP}
          value={minText}
          aria-label={t("products.filters.priceMin")}
          onChange={(event) => {
            setMinText(digitsOnly(event.target.value));
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
        <span aria-hidden="true" className="text-gray-400">
          –
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={low}
          max={high}
          step={PRICE_STEP}
          value={maxText}
          aria-label={t("products.filters.priceMax")}
          onChange={(event) => {
            setMaxText(digitsOnly(event.target.value));
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
      </div>
    </fieldset>
  );
};
