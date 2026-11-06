import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCountdownParts, padCountdown, parseDeadline } from "./countdown.ts";

describe("parseDeadline", () => {
  it("accepts ISO strings, timestamps and Date objects", () => {
    assert.equal(
      parseDeadline("2026-11-30T16:59:59.000Z"),
      Date.parse("2026-11-30T16:59:59.000Z"),
    );
    assert.equal(parseDeadline(1_700_000_000_000), 1_700_000_000_000);
    assert.equal(
      parseDeadline(new Date("2026-01-02T03:04:05.000Z")),
      Date.parse("2026-01-02T03:04:05.000Z"),
    );
  });

  it("returns null for missing or invalid values", () => {
    for (const value of [null, undefined, "", "not-a-date"]) {
      assert.equal(parseDeadline(value), null, String(value));
    }
  });
});

describe("getCountdownParts", () => {
  const now = Date.parse("2026-11-06T10:00:00.000Z");

  it("splits a future deadline into days/hours/minutes/seconds", () => {
    const parts = getCountdownParts("2026-11-07T12:34:56.000Z", now);
    assert.deepEqual(
      {
        days: parts.days,
        hours: parts.hours,
        minutes: parts.minutes,
        seconds: parts.seconds,
        expired: parts.expired,
      },
      { days: 1, hours: 2, minutes: 34, seconds: 56, expired: false },
    );
  });

  it("counts full days and rolls the remainder into hours", () => {
    const parts = getCountdownParts("2026-11-16T10:00:00.000Z", now);
    assert.equal(parts.days, 10);
    assert.equal(parts.hours, 0);
    assert.equal(parts.minutes, 0);
    assert.equal(parts.seconds, 0);
  });

  it("marks a past deadline as expired with zeroed parts", () => {
    const parts = getCountdownParts("2026-11-05T10:00:00.000Z", now);
    assert.deepEqual(parts, {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      remainingMs: 0,
      expired: true,
    });
  });

  it("treats the exact deadline as expired", () => {
    const parts = getCountdownParts(now, now);
    assert.equal(parts.expired, true);
    assert.equal(parts.remainingMs, 0);
  });

  it("marks an invalid deadline as expired", () => {
    const parts = getCountdownParts("not-a-date", now);
    assert.equal(parts.expired, true);
    assert.equal(parts.remainingMs, 0);
  });

  it("floors partial seconds instead of rounding up", () => {
    const parts = getCountdownParts(now + 1_999, now);
    assert.equal(parts.seconds, 1);
    assert.equal(parts.expired, false);
  });
});

describe("padCountdown", () => {
  it("always renders two digits", () => {
    assert.equal(padCountdown(0), "00");
    assert.equal(padCountdown(9), "09");
    assert.equal(padCountdown(10), "10");
    assert.equal(padCountdown(123), "123");
  });

  it("never renders negative or fractional values", () => {
    assert.equal(padCountdown(-5), "00");
    assert.equal(padCountdown(7.9), "07");
  });
});
