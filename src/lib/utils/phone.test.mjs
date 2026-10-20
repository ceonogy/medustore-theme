import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidVietnamPhone } from "./phone.ts";

describe("isValidVietnamPhone", () => {
  it("accepts mobile numbers (03x/05x/07x/08x/09x)", () => {
    for (const phone of [
      "0912345678",
      "0387654321",
      "0701122334",
      "0561234567",
      "0898765432",
    ]) {
      assert.equal(isValidVietnamPhone(phone), true, phone);
    }
  });

  it("accepts landline numbers (02x area codes)", () => {
    for (const phone of ["02431234567", "02838123456", "02963812345"]) {
      assert.equal(isValidVietnamPhone(phone), true, phone);
    }
  });

  it("accepts international +84 and 84 prefixes", () => {
    for (const phone of [
      "+84912345678",
      "+84 912 345 678",
      "84912345678",
      "+842431234567",
    ]) {
      assert.equal(isValidVietnamPhone(phone), true, phone);
    }
  });

  it("ignores separators people type", () => {
    for (const phone of [
      "0912 345 678",
      "0912.345.678",
      "0912-345-678",
      "(0912) 345 678",
    ]) {
      assert.equal(isValidVietnamPhone(phone), true, phone);
    }
  });

  it("rejects invalid numbers", () => {
    for (const phone of [
      "",
      "abc",
      "091234567", // too short
      "09123456789", // too long
      "0123456789", // 01x is not a mobile prefix
      "0612345678", // 06x is not a valid prefix
      "1912345678", // missing trunk 0 / +84
      "+8512345678", // wrong country code
      "0912345678x",
    ]) {
      assert.equal(isValidVietnamPhone(phone), false, phone);
    }
  });
});
