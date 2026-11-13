import type { StoreCustomer, StoreUpdateCustomer } from "@medusajs/types";
import { transferCartToCustomer } from "@lib/stores/cart";
import { sdk } from "@lib/sdk";
import {
  AuthError,
  loginHref,
  toAuthError,
  tokenActorId,
} from "@lib/utils/auth-session";

export { AuthError, toAuthError };
export type { AuthErrorCode } from "@lib/utils/auth-session";

export interface CredentialsInput {
  email: string;
  password: string;
}

export interface RegisterInput extends CredentialsInput {
  first_name?: string;
  last_name?: string;
}

/**
 * True when the SDK has a stored JWT (possibly expired - `me()` is the
 * authoritative check).
 */
export async function hasSessionToken(): Promise<boolean> {
  return Boolean(await sdk.client.getToken());
}

async function clearSession(): Promise<void> {
  await sdk.client.clearToken();
}

/**
 * Create a customer account: `register -> login -> POST /store/customers`.
 *
 * The extra login is deliberate: a plain registration token carries no actor
 * and live testing showed `customer.create` rejecting it, while a login token
 * consistently works (verified against this backend).
 */
export async function register(input: RegisterInput): Promise<StoreCustomer> {
  const { email, password } = input;
  try {
    const registered = await sdk.auth.register("customer", "emailpass", {
      email,
      password,
    });
    if (typeof registered !== "string") {
      throw new AuthError("Unexpected registration response", "unknown");
    }
    // Registering an e-mail whose identity already has a customer returns a
    // token with that actor - surface it as a taken e-mail instead of silently
    // logging into the existing account.
    if (tokenActorId(registered)) {
      await clearSession();
      throw new AuthError("Email is already registered", "email_taken");
    }
    await sdk.auth.login("customer", "emailpass", { email, password });

    const { customer } = await sdk.store.customer.create({
      email,
      ...(input.first_name ? { first_name: input.first_name } : {}),
      ...(input.last_name ? { last_name: input.last_name } : {}),
    });
    // The login token predates the customer link (actor_id still empty):
    // refresh it so the stored JWT carries the new actor and
    // GET /store/customers/me resolves on the dashboard right away.
    await sdk.auth.refresh();
    void transferCartToCustomer();
    return customer as StoreCustomer;
  } catch (error) {
    if (!(error instanceof AuthError)) await clearSession();
    throw toAuthError(error);
  }
}

/**
 * Login, then resolve the customer profile.
 *
 * An identity can exist without a linked customer row (a registration that
 * failed midway): `GET /store/customers/me` then misses and we heal the
 * account by creating the missing row.
 */
export async function login(input: CredentialsInput): Promise<StoreCustomer> {
  const { email, password } = input;
  try {
    await sdk.auth.login("customer", "emailpass", { email, password });
    const customer = await fetchCustomerOrHeal(email);
    void transferCartToCustomer();
    return customer;
  } catch (error) {
    await clearSession();
    throw toAuthError(error);
  }
}

async function fetchCustomerOrHeal(email: string): Promise<StoreCustomer> {
  try {
    const { customer } = await sdk.store.customer.retrieve();
    return customer as StoreCustomer;
  } catch (retrieveError) {
    const status = toAuthError(retrieveError).status;
    if (status === 401 || status === 403) throw retrieveError;
    try {
      const { customer } = await sdk.store.customer.create({ email });
      return customer as StoreCustomer;
    } catch {
      throw retrieveError;
    }
  }
}

/**
 * Current customer, or null when logged out. 401/403 clears the stale
 * token (session expiry handling); 404 (token without a linked customer)
 * counts as logged out without destroying the token.
 */
export async function me(): Promise<StoreCustomer | null> {
  if (!(await hasSessionToken())) return null;
  try {
    const { customer } = await sdk.store.customer.retrieve();
    return customer as StoreCustomer;
  } catch (error) {
    const authError = toAuthError(error);
    if (authError.status === 401 || authError.status === 403) {
      await clearSession();
      return null;
    }
    if (authError.status === 404) return null;
    throw authError;
  }
}

/**
 * Logout. JWT mode only clears the stored token; if the SDK call ever fails
 * we still guarantee a clean local session.
 */
export async function logout(): Promise<void> {
  try {
    await sdk.auth.logout();
  } catch {
    await clearSession();
  }
}

/**
 * Update the signed-in customer's profile (POST /store/customers/me).
 * A `null` phone clears the stored value.
 */
export async function updateProfile(input: {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
}): Promise<StoreCustomer> {
  try {
    // The API accepts and stores `phone: null` to clear the value (verified
    // live), but the SDK's StoreUpdateCustomer type only declares string.
    const { customer } = await sdk.store.customer.update(
      input as unknown as StoreUpdateCustomer,
    );
    return customer as StoreCustomer;
  } catch (error) {
    throw toAuthError(error);
  }
}

/** Path of the current page (for `?next=`) - browser only. */
/**
 * Start the password-reset flow: POST /auth/customer/emailpass/reset-password.
 *
 * The route answers 201 whether or not the account exists (no
 * enumeration); the reset link itself arrives by email, sent by the
 * backend's `auth.password_reset` subscriber.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sdk.auth.resetPassword("customer", "emailpass", {
      identifier: email,
    });
  } catch (error) {
    throw toAuthError(error);
  }
}

/**
 * Consume the single-use reset token from the emailed link and set the new
 * password. The token is a purpose-bound JWT (15-minute TTL) — the backend
 * rejects session bearers, expired tokens and replays.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<void> {
  try {
    await sdk.auth.updateProvider("customer", "emailpass", { password }, token);
  } catch (error) {
    throw toAuthError(error);
  }
}

export function currentRequestPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

/** Login href for the current (or given) page. */
export function loginRedirectTarget(next?: string): string {
  return loginHref(next ?? currentRequestPath());
}

/** Hard-redirect the browser to the login page (guards on form errors). */
export function redirectToLogin(next?: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(loginRedirectTarget(next));
}
