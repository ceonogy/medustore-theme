import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AuthError,
  decodeTokenPayload,
  isTokenExpired,
  loginHref,
  sanitizeNextPath,
  toAuthError,
  tokenActorId,
  tokenExpirationMs,
} from "./auth-session.ts";

const makeToken = (payload) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

describe("sanitizeNextPath", () => {
  it("keeps same-origin absolute paths", () => {
    assert.equal(
      sanitizeNextPath("/tai-khoan/don-hang?trang=1"),
      "/tai-khoan/don-hang?trang=1",
    );
    assert.equal(sanitizeNextPath("  /store?q=ao  "), "/store?q=ao");
  });

  it("rejects missing or blank values", () => {
    assert.equal(sanitizeNextPath(null), "/");
    assert.equal(sanitizeNextPath(undefined), "/");
    assert.equal(sanitizeNextPath(""), "/");
    assert.equal(sanitizeNextPath("   "), "/");
  });

  it("rejects open-redirect vectors", () => {
    assert.equal(sanitizeNextPath("https://evil.example"), "/");
    assert.equal(sanitizeNextPath("//evil.example"), "/");
    assert.equal(sanitizeNextPath("/\\evil.example"), "/");
    assert.equal(sanitizeNextPath("javascript:alert(1)"), "/");
    assert.equal(sanitizeNextPath("/pa\u0000th"), "/");
  });

  it("honours a custom fallback", () => {
    assert.equal(sanitizeNextPath("//evil.example", ""), "");
  });
});

describe("loginHref", () => {
  it("builds the plain login path without next", () => {
    assert.equal(loginHref(null), "/tai-khoan/dang-nhap");
    assert.equal(loginHref(undefined), "/tai-khoan/dang-nhap");
    assert.equal(loginHref("/"), "/tai-khoan/dang-nhap");
    assert.equal(loginHref("//evil.example"), "/tai-khoan/dang-nhap");
  });

  it("encodes a safe next target", () => {
    assert.equal(
      loginHref("/store?q=ao"),
      "/tai-khoan/dang-nhap?next=%2Fstore%3Fq%3Dao",
    );
  });
});

describe("toAuthError", () => {
  it("maps the live bad-login response to invalid_credentials", () => {
    const error = new Error("Invalid email or password");
    error.status = 401;
    const result = toAuthError(error);
    assert.equal(result.code, "invalid_credentials");
    assert.equal(result.status, 401);
    assert.equal(result.name, "AuthError");
  });

  it("maps message-only credential failures without a status", () => {
    assert.equal(
      toAuthError(new Error("Invalid email or password")).code,
      "invalid_credentials",
    );
  });

  it("keeps generic 401s as session_expired", () => {
    const error = new Error("Unauthorized");
    error.status = 401;
    assert.equal(toAuthError(error).code, "session_expired");
  });

  it("maps taken e-mails, network and server failures", () => {
    assert.equal(
      toAuthError(new Error("This identity already exists")).code,
      "email_taken",
    );
    assert.equal(toAuthError(new Error("Failed to fetch")).code, "network");
    const server = new Error("boom");
    server.status = 500;
    assert.equal(toAuthError(server).code, "server");
    assert.equal(toAuthError(new Error("boom")).code, "unknown");
    assert.equal(toAuthError("plain string").message, "plain string");
    assert.equal(toAuthError(null).message, "Unknown error");
  });

  it("passes AuthError instances through untouched", () => {
    const original = new AuthError("x", "email_taken");
    assert.equal(toAuthError(original), original);
  });
});

describe("token helpers", () => {
  const future = makeToken({ exp: 1_800_000_000, actor_id: "cus_1" });

  it("decodes payload fields from a JWT", () => {
    assert.deepEqual(decodeTokenPayload(future), {
      exp: 1_800_000_000,
      actor_id: "cus_1",
    });
    assert.equal(tokenExpirationMs(future), 1_800_000_000_000);
    assert.equal(tokenActorId(future), "cus_1");
  });

  it("returns null for registration tokens without an actor", () => {
    assert.equal(tokenActorId(makeToken({ exp: 1, actor_id: "" })), null);
    assert.equal(tokenActorId(makeToken({ exp: 1 })), null);
  });

  it("rejects malformed tokens", () => {
    assert.equal(decodeTokenPayload("not-a-jwt"), null);
    assert.equal(decodeTokenPayload(""), null);
    assert.equal(decodeTokenPayload(null), null);
    assert.equal(tokenExpirationMs("a.b.c"), null);
    assert.equal(tokenActorId(undefined), null);
  });

  it("computes expiry with skew and treats unknown as valid", () => {
    const expMs = 1_800_000_000_000;
    assert.equal(
      isTokenExpired(future, expMs - 3_600_000),
      false,
      "still fresh",
    );
    assert.equal(isTokenExpired(future, expMs - 20_000), true, "inside skew");
    assert.equal(isTokenExpired(future, expMs + 120_000), true, "past exp");
    assert.equal(isTokenExpired(makeToken({ exp: 1 }), expMs), true);
    assert.equal(
      isTokenExpired("garbage", expMs),
      false,
      "undecodable = valid",
    );
    assert.equal(isTokenExpired(null, expMs), false);
  });
});
