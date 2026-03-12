/**
 * HTTP request/response helper utilities.
 * Extracted from index.js to keep the server entry point focused.
 */
"use strict";

const { URL } = require("node:url");
const { Sanitizer } = require("./security/sanitizer");
const { Validator } = require("./security/validator");

/**
 * Send a JSON response.
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {object} payload
 */
function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

/**
 * Read the full request body with a size limit.
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB
    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy(new Error("Request body too large"));
        reject(new Error("Request body exceeds 10 MB limit"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve("");
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      resolve(raw);
    });
    req.on("error", reject);
  });
}

/**
 * Parse a JSON string safely.
 * @param {string} raw
 * @returns {{ ok: boolean, value?: object, error?: string }}
 */
function parseJsonBody(raw) {
  if (!raw || raw.trim() === "") {
    return { ok: false, error: "Empty request body" };
  }
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, value: parsed };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

/**
 * Validate and sanitize input fields against a schema.
 * @param {object} body
 * @param {object} schema
 * @param {Sanitizer} sanitizer
 * @param {Validator} validator
 * @returns {{ valid: boolean, errors: string[], data: object }}
 */
function validateAndSanitizeInput(body, schema, sanitizer, validator) {
  const errors = [];
  const sanitized = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = body[key];

    // Required check
    if (
      rules.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`${key} is required`);
      continue;
    }

    // Skip validation if optional and not provided
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type === "string" && typeof value !== "string") {
      errors.push(`${key} must be a string`);
      continue;
    }

    if (rules.type === "number" && typeof value !== "number") {
      errors.push(`${key} must be a number`);
      continue;
    }

    if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be a boolean`);
      continue;
    }

    // String validation
    if (typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
        continue;
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${key} must be at most ${rules.maxLength} characters`);
        continue;
      }

      // Sanitize text inputs
      if (rules.sanitize !== false) {
        const result = sanitizer.sanitizePrompt(value, {
          mode: rules.sanitizeMode || "moderate",
        });
        if (result.hasThreats && rules.rejectThreats) {
          errors.push(
            `${key} contains potential security threats: ${result.threats.join(", ")}`,
          );
          continue;
        }
        sanitized[key] = result.sanitized;
      } else {
        sanitized[key] = value;
      }

      // URL validation
      if (rules.format === "url") {
        try {
          const url = new URL(value);
          if (
            rules.allowedProtocols &&
            !rules.allowedProtocols.includes(url.protocol.replace(":", ""))
          ) {
            errors.push(
              `${key} protocol must be one of: ${rules.allowedProtocols.join(", ")}`,
            );
            continue;
          }
          sanitized[key] = value;
        } catch {
          errors.push(`${key} must be a valid URL`);
          continue;
        }
      }

      // Path validation
      if (rules.format === "path" && validator) {
        const pathValidation = validator.isValidFilePath(value, {
          mustExist: rules.mustExist,
          checkReadable: rules.checkReadable,
        });
        if (!pathValidation.valid) {
          errors.push(`${key}: ${pathValidation.errors.join(", ")}`);
          continue;
        }
        sanitized[key] = pathValidation.path;
      }
    } else {
      sanitized[key] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: sanitized,
  };
}

/**
 * Sanitise a filename by stripping unsafe characters.
 * @param {string} name
 * @returns {string}
 */
function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Wrap an async route handler with error handling.
 * @param {import("node:http").ServerResponse} res
 * @param {Function} handler
 * @param {import("pino").Logger} logger
 */
async function handleRoute(res, handler, logger) {
  try {
    await handler();
  } catch (error) {
    if (logger) {
      logger.error(
        { error: error.message, stack: error.stack },
        "Route handling failed",
      );
    }
    jsonResponse(res, 500, {
      error: error.message || "Internal server error",
    });
  }
}

module.exports = {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  safeFilename,
  handleRoute,
};
