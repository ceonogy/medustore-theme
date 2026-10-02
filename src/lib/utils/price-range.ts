/**
 * The price slider's arithmetic — pure, so the island and the tests share
 * exactly one rule.
 *
 * The slider moves in 10,000 ₫ steps and only ever produces integer
 * `price_min`/`price_max` values the middleware already understands. The one
 * behavioural rule worth stating: a bound that covers the whole slider means
 * "no filter" and is dropped, so dragging back to full range returns the clean
 * URL instead of leaving a parameter that filters nothing.
 */
import type { CatalogState } from "./canonical-query";
import type { PriceBounds } from "./catalog";

export const PRICE_STEP = 10_000;

export const floorToStep = (value: number): number =>
  Math.floor(value / PRICE_STEP) * PRICE_STEP;

export const ceilToStep = (value: number): number =>
  Math.ceil(value / PRICE_STEP) * PRICE_STEP;

export const clampPrice = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

/** Digits only, so "450.000" or "450 000" types in as 450000. */
export const parsePriceInput = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
};

export type PriceRangeValue = { min: number; max: number };

/**
 * Slider endpoints snapped outward: the cheapest catalogue price must be
 * reachable by the low handle, the dearest by the high one.
 */
export const sliderBounds = (
  bounds: NonNullable<PriceBounds>,
): { low: number; high: number } => ({
  low: floorToStep(bounds.min),
  high: ceilToStep(bounds.max),
});

/** Handles for a state: what is set in the URL, clamped, else the ends. */
export const initialRange = (
  state: Pick<CatalogState, "price_min" | "price_max">,
  low: number,
  high: number,
): PriceRangeValue => ({
  min: clampPrice(state.price_min ?? low, low, high),
  max: clampPrice(state.price_max ?? high, low, high),
});

/**
 * Writes a range back into the filter state: each bound equal to its slider
 * end is cleared (it would filter nothing), and touching a filter resets
 * pagination — the new result set starts at page 1.
 */
export const withPrice = (
  state: CatalogState,
  range: PriceRangeValue,
  low: number,
  high: number,
): CatalogState => ({
  ...state,
  price_min: range.min > low ? range.min : null,
  price_max: range.max < high ? range.max : null,
  page: null,
});
