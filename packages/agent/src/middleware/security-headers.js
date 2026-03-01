/**
 * Security Headers Middleware
 * Applies standard security headers (CORS, CSP, X-Frame-Options, etc.)
 */

function createSecurityHeadersMiddleware(options = {}) {
  const {
    corsOrigin = process.env.CORS_ORIGIN || "http://localhost:*",
    corsCredentials = process.env.CORS_CREDENTIALS !== "false",
    cspPolicy = process.env.CSP_POLICY ||
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    enableStrictTransportSecurity = process.env.ENABLE_HSTS !== "false",
    hstsMaxAge = parseInt(process.env.HSTS_MAX_AGE || "31536000"),
  } = options;

  return (req, res, next) => {
    // CORS headers
    const origin = req.headers.origin;

    // Strict localhost check: only allow exact localhost origins with any port
    const LOCALHOST_RE = /^https?:\/\/localhost(:\d{1,5})?$/;
    const isCorsAllowed =
      corsOrigin === "*"
        ? true
        : corsOrigin.includes(":*")
          ? LOCALHOST_RE.test(origin || "")
          : origin === corsOrigin;

    if (isCorsAllowed || corsOrigin === "*") {
      res.setHeader("Access-Control-Allow-Origin", origin || corsOrigin);
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Request-ID",
      );

      if (corsCredentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }

      res.setHeader("Access-Control-Max-Age", "3600");
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Enable XSS protection
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Content Security Policy
    res.setHeader("Content-Security-Policy", cspPolicy);

    // Strict Transport Security (HTTPS only)
    if (enableStrictTransportSecurity) {
      res.setHeader(
        "Strict-Transport-Security",
        `max-age=${hstsMaxAge}; includeSubDomains`,
      );
    }

    // Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Permissions Policy (formerly Feature-Policy)
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );

    next();
  };
}

module.exports = { createSecurityHeadersMiddleware };
