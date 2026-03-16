"use strict";
const { describe, it } = require("node:test");

const assert = require("node:assert/strict");
const { redactSecret, redactKeysInString } = require("../src/utils/redact");

describe("redactSecret", () => {
  it("shows last 4 chars by default", () => {
    assert.equal(redactSecret("sk-1234567890abcdef"), "****cdef");
  });

  it("handles empty/null", () => {
    assert.equal(redactSecret(null), "[empty]");
    assert.equal(redactSecret(undefined), "[empty]");
    assert.equal(redactSecret(""), "[empty]");
  });

  it("handles short strings (length <= showLast)", () => {
    assert.equal(redactSecret("abc"), "****");
    assert.equal(redactSecret("abcd"), "****");
  });
});

describe("redactKeysInString", () => {
  it("finds and redacts sk- keys", () => {
    const input = "Error: invalid key sk-abcdefghijklmnop in request";
    const result = redactKeysInString(input);
    assert.ok(!result.includes("sk-abcdefghijklmnop"), "key should be redacted");
    assert.ok(result.includes("****mnop"), "last 4 chars should be visible");
  });

  it("finds and redacts gsk_ keys", () => {
    const input = "Using key gsk_abcdefghijklmnop for auth";
    const result = redactKeysInString(input);
    assert.ok(!result.includes("gsk_abcdefghijklmnop"), "key should be redacted");
    assert.ok(result.includes("****mnop"), "last 4 chars should be visible");
  });

  it("finds and redacts AIza keys", () => {
    const input = "Google key AIzaSyDexampleKeyHere123 detected";
    const result = redactKeysInString(input);
    assert.ok(!result.includes("AIzaSyDexampleKeyHere123"), "key should be redacted");
    assert.ok(result.includes("****"));
  });

  it("leaves short strings alone", () => {
    const input = "no keys here";
    assert.equal(redactKeysInString(input), "no keys here");
  });

  it("handles non-string input", () => {
    assert.equal(redactKeysInString(null), null);
    assert.equal(redactKeysInString(undefined), undefined);
    assert.equal(redactKeysInString(42), 42);
  });
});
