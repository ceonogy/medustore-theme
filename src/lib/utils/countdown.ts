/**
 * Countdown maths shared by every sale surface (product detail, promotion
 * page). Pure functions so they can be unit-tested and so the Astro
 * component can render the first frame on the server while the client
 * script only re-renders the ticking digits.
 */

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds left, clamped to 0 once the deadline has passed. */
  remainingMs: number;
  expired: boolean;
}

const ZERO: CountdownParts = {
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  remainingMs: 0,
  expired: true,
};

/** Parse the many shapes a Medusa date can take; `null` when unusable. */
export const parseDeadline = (
  endsAt: string | number | Date | null | undefined,
): number | null => {
  if (endsAt === null || endsAt === undefined || endsAt === "") return null;
  const value =
    endsAt instanceof Date
      ? endsAt.getTime()
      : typeof endsAt === "number"
        ? endsAt
        : Date.parse(String(endsAt));
  return Number.isFinite(value) ? value : null;
};

/**
 * Split the time left until `endsAt` into whole days/hours/minutes/seconds.
 * An invalid or past deadline reports `expired: true` with every part at 0.
 */
export const getCountdownParts = (
  endsAt: string | number | Date | null | undefined,
  now: number = Date.now(),
): CountdownParts => {
  const deadline = parseDeadline(endsAt);
  if (deadline === null) return { ...ZERO };

  const remainingMs = deadline - now;
  if (remainingMs <= 0) return { ...ZERO };

  const totalSeconds = Math.floor(remainingMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    remainingMs,
    expired: false,
  };
};

/** Two-digit display, matching the countdown tiles (e.g. 9 -> "09"). */
export const padCountdown = (value: number): string =>
  String(Math.max(0, Math.trunc(value))).padStart(2, "0");
