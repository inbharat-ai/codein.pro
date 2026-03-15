"use strict";

/**
 * Redact sensitive values from strings.
 * Shows only last N characters for identification.
 */
function redactSecret(value, showLast = 4) {
  if (!value || typeof value !== "string") return "[empty]";
  if (value.length <= showLast) return "****";
  return "****" + value.slice(-showLast);
}

/**
 * Redact any API key patterns from a string (error messages, logs).
 * Matches common key patterns: sk-*, gsk_*, AIza*, xai-*, etc.
 */
function redactKeysInString(str) {
  if (typeof str !== "string") return str;
  return str.replace(
    /\b(sk-[a-zA-Z0-9]{10,}|gsk_[a-zA-Z0-9]{10,}|AIza[a-zA-Z0-9_-]{10,}|xai-[a-zA-Z0-9]{10,}|[a-zA-Z0-9]{32,})/g,
    (match) => redactSecret(match),
  );
}

module.exports = { redactSecret, redactKeysInString };
