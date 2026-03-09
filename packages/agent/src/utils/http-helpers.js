/**
 * Shared HTTP helper utilities — extracted from monolithic index.js
 */

const { Sanitizer } = require("../security/sanitizer");

const sanitizer = new Sanitizer();

function jsonResponse(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxSize = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy(new Error("Request body too large"));
        reject(new Error(`Request body exceeds ${maxSize} byte limit`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve("");
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function parseJsonBody(raw) {
  if (!raw || raw.trim() === "") {
    return { ok: false, error: "Empty request body" };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

function validateAndSanitizeInput(body, schema) {
  const errors = [];
  const sanitized = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = body[key];
    if (
      rules.required &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push(`${key} is required`);
      continue;
    }
    if (!rules.required && (value === undefined || value === null)) continue;

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

    if (typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
        continue;
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${key} must be at most ${rules.maxLength} characters`);
        continue;
      }
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
      if (rules.format === "path") {
        // Reject path traversal, null bytes, and shell-dangerous characters
        if (
          /\0/.test(value) ||
          /\.\.[/\\]/.test(value) ||
          /[;|&$`]/.test(value)
        ) {
          errors.push(`${key} contains dangerous path characters`);
          continue;
        }
        sanitized[key] = value;
      }
    } else {
      sanitized[key] = value;
    }
  }
  return { valid: errors.length === 0, errors, data: sanitized };
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function handleRoute(res, handler, logger) {
  const requestId = res.getHeader?.("x-request-id") || "unknown";
  try {
    await handler();
  } catch (error) {
    if (logger) {
      logger.error(
        { error: error.message, stack: error.stack, requestId },
        "Route handling failed",
      );
    }
    jsonResponse(res, 500, {
      error: error.message || "Internal server error",
      requestId,
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
