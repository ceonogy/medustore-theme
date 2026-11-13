/**
 * Pure helpers for the customer auth flow. This module imports nothing -
 * no SDK, no browser APIs - so it runs unchanged under
 * `node --experimental-strip-types --test` (see auth-session.test.mjs)
 * and in the browser.
 */

export type AuthErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "invalid_verification"
  | "session_expired"
  | "network"
  | "server"
  | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;
  status: number | null;

  constructor(
    message: string,
    code: AuthErrorCode,
    status: number | null = null,
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Medusa error message -> stable code. The first pattern is live-verified
 * against this backend: a bad login answers 401 "Invalid email or password".
 */
const CODE_PATTERNS: [RegExp, AuthErrorCode][] = [
  [/invalid email or password/i, "invalid_credentials"],
  [
    /(email|password|credential)[^.]*\b(invalid|incorrect|wrong|mismatch)|\b(invalid|incorrect|wrong|mismatch)[^.]*\b(email|password|credential)/i,
    "invalid_credentials",
  ],
  [
    /(already registered|identity already|already exists|already been taken)/i,
    "email_taken",
  ],
  [
    /(verification[^.]*\b(invalid|expired|incorrect)|\b(invalid|expired|incorrect)[^.]*verification)/i,
    "invalid_verification",
  ],
  [/failed to fetch|network|\beconn|\betimedout|timed? ?out/i, "network"],
];

function readStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error as { status?: unknown };
    if (typeof status === "number") return status;
  }
  return null;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/**
 * Wrap any thrown value into an AuthError with a stable `code` the i18n
 * dictionary can map to Vietnamese copy, plus the HTTP status if present
 * (js-sdk's FetchError carries `status`).
 */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const status = readStatus(error);
  const message = readMessage(error);
  for (const [pattern, code] of CODE_PATTERNS) {
    if (pattern.test(message)) return new AuthError(message, code, status);
  }
  // Message patterns run first: a 401 with "Invalid email or password" must
  // stay invalid_credentials, not session_expired.
  if (status === 401 || status === 403) {
    return new AuthError(message, "session_expired", status);
  }
  if (status !== null && status >= 500) {
    return new AuthError(message, "server", status);
  }
  return new AuthError(message, "unknown", status);
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Allow only same-origin absolute paths for `?next=` redirect targets.
 * Anything else (external URLs, protocol-relative `//host`, backslashes,
 * control characters) falls back - open-redirect guard.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  if (hasControlChars(value)) return fallback;
  return value;
}

/** Login page href, carrying a sanitized `?next=` only when meaningful. */
export function loginHref(next?: string | null): string {
  const safe =
    typeof next === "string" && next !== "/" ? sanitizeNextPath(next, "") : "";
  return safe
    ? `/tai-khoan/dang-nhap?next=${encodeURIComponent(safe)}`
    : "/tai-khoan/dang-nhap";
}

type TokenPayload = {
  exp?: unknown;
  actor_id?: unknown;
};

/** Decode the JWT payload (base64url) - null on anything malformed. */
export function decodeTokenPayload(
  token: string | null | undefined,
): TokenPayload | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const segment = token.split(".")[1];
  if (!segment) return null;
  try {
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded));
    if (typeof payload !== "object" || payload === null) return null;
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

/** Token expiry in epoch milliseconds, or null when undecodable. */
export function tokenExpirationMs(
  token: string | null | undefined,
): number | null {
  const payload = decodeTokenPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
}

/** Linked customer id from the token, or null for a bare registration token. */
export function tokenActorId(token: string | null | undefined): string | null {
  const payload = decodeTokenPayload(token);
  return typeof payload?.actor_id === "string" && payload.actor_id
    ? payload.actor_id
    : null;
}

/**
 * Expiry check with a safety skew. Undecodable tokens count as NOT expired -
 * unknown formats must never force a logout.
 */
export function isTokenExpired(
  token: string | null | undefined,
  nowMs: number = Date.now(),
  skewMs = 30_000,
): boolean {
  const expiration = tokenExpirationMs(token);
  if (expiration === null) return false;
  return expiration - skewMs <= nowMs;
}
