const test = require("node:test");
const assert = require("node:assert");
const {
  RateLimiter,
  createRateLimiterMiddleware,
} = require("../src/middleware/rate-limiter");
const {
  createSecurityHeadersMiddleware,
} = require("../src/middleware/security-headers");

test("rate limiter allows requests within limit", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 5,
    requestsPerHour: 100,
  });

  for (let i = 0; i < 5; i++) {
    const result = limiter.isAllowed("192.168.1.1");
    assert.strictEqual(
      result.allowed,
      true,
      `Request ${i + 1} should be allowed`,
    );
  }

  const blocked = limiter.isAllowed("192.168.1.1");
  assert.strictEqual(blocked.allowed, false, "Request 6 should be blocked");
  assert.ok(blocked.retryAfter > 0, "retryAfter should be positive");

  limiter.destroy();
});

test("rate limiter resets per-minute bucket", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 2,
    requestsPerHour: 100,
  });

  // Use up the minute bucket
  limiter.isAllowed("192.168.1.2");
  limiter.isAllowed("192.168.1.2");
  assert.strictEqual(
    limiter.isAllowed("192.168.1.2").allowed,
    false,
    "Should be blocked",
  );

  // Manually advance the minute bucket reset
  const bucket = limiter.getBucket("ip:192.168.1.2");
  bucket.minute.resetAt = Date.now() - 1000; // Set to past

  // Should now be allowed
  const result = limiter.isAllowed("192.168.1.2");
  assert.strictEqual(result.allowed, true, "Should be allowed after reset");

  limiter.destroy();
});

test("rate limiter uses user-specific buckets", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 2,
    requestsPerHour: 100,
  });

  // User 1 uses 2 requests
  limiter.isAllowed("192.168.1.3", "user1");
  limiter.isAllowed("192.168.1.3", "user1");

  // User 1 should be blocked
  assert.strictEqual(limiter.isAllowed("192.168.1.3", "user1").allowed, false);

  // Same IP as different user should still have requests
  const result = limiter.isAllowed("192.168.1.3", "user2");
  assert.strictEqual(
    result.allowed,
    true,
    "Different user should have separate limits",
  );

  limiter.destroy();
});

test("security headers middleware sets correct headers", () => {
  const middleware = createSecurityHeadersMiddleware({
    corsOrigin: "http://localhost:*",
    cspPolicy: "default-src 'self'",
  });

  const req = {
    method: "GET",
    headers: {
      origin: "http://localhost:3000",
    },
  };

  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    writeHead() {},
    end() {},
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  middleware(req, res, next);

  assert.strictEqual(
    headers["X-Frame-Options"],
    "DENY",
    "Should set X-Frame-Options",
  );
  assert.strictEqual(
    headers["X-Content-Type-Options"],
    "nosniff",
    "Should set X-Content-Type-Options",
  );
  assert.strictEqual(
    headers["Content-Security-Policy"],
    "default-src 'self'",
    "Should set CSP",
  );
  assert.ok(headers["Strict-Transport-Security"], "Should set HSTS");
  assert.strictEqual(nextCalled, true, "Should call next()");
});

test("security headers middleware handles CORS preflight", () => {
  const middleware = createSecurityHeadersMiddleware();

  const req = {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:3000",
    },
  };

  let statusCode = null;
  const res = {
    setHeader() {},
    writeHead(code) {
      statusCode = code;
    },
    end() {},
  };

  const next = () => {};

  middleware(req, res, next);

  assert.strictEqual(statusCode, 204, "Should return 204 for preflight");
});

test("rate limiter middleware returns 429 when limited", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 1,
    requestsPerHour: 100,
  });
  const middleware = createRateLimiterMiddleware(limiter);

  // First request succeeds
  const req1 = {
    method: "GET",
    headers: {},
    connection: { remoteAddress: "192.168.1.4" },
    user: null,
  };

  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  const res1 = {
    setHeader() {},
  };

  middleware(req1, res1, next);
  assert.strictEqual(nextCalled, true, "First request should pass");

  // Second request is rate limited
  const req2 = {
    method: "GET",
    headers: { "x-forwarded-for": "192.168.1.4" },
    connection: { remoteAddress: "192.168.1.4" },
    user: null,
  };

  let responseEnded = false;
  let responseStatus = null;
  const res2 = {
    writeHead(code, headers) {
      responseStatus = code;
    },
    setHeader() {},
    end(data) {
      responseEnded = true;
    },
  };

  middleware(req2, res2, () => {});

  assert.strictEqual(
    responseStatus,
    429,
    "Should return 429 Too Many Requests",
  );
  assert.strictEqual(responseEnded, true, "Should end response");

  limiter.destroy();
});

test("rate limiter ignores x-forwarded-for when trustProxy is false", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 1,
    requestsPerHour: 100,
  });
  const middleware = createRateLimiterMiddleware(limiter, {
    trustProxy: false,
  });

  // First request consumes the limit for socket IP 10.0.0.8.
  middleware(
    {
      method: "GET",
      headers: {},
      connection: { remoteAddress: "10.0.0.8" },
      user: null,
    },
    { setHeader() {} },
    () => {},
  );

  // Second request sends spoofed forwarded IP, but should still be rate-limited by socket IP.
  let status = null;
  middleware(
    {
      method: "GET",
      headers: { "x-forwarded-for": "203.0.113.55" },
      connection: { remoteAddress: "10.0.0.8" },
      user: null,
    },
    {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end() {},
    },
    () => {},
  );

  assert.strictEqual(status, 429);
  limiter.destroy();
});

test("rate limiter trusts x-forwarded-for when trustProxy is true", () => {
  const limiter = new RateLimiter({
    requestsPerMinute: 1,
    requestsPerHour: 100,
  });
  const middleware = createRateLimiterMiddleware(limiter, { trustProxy: true });

  middleware(
    {
      method: "GET",
      headers: { "x-forwarded-for": "198.51.100.10" },
      connection: { remoteAddress: "10.0.0.9" },
      user: null,
    },
    { setHeader() {} },
    () => {},
  );

  let status = null;
  middleware(
    {
      method: "GET",
      headers: { "x-forwarded-for": "198.51.100.10" },
      connection: { remoteAddress: "10.0.0.9" },
      user: null,
    },
    {
      writeHead(code) {
        status = code;
      },
      setHeader() {},
      end() {},
    },
    () => {},
  );

  assert.strictEqual(status, 429);
  limiter.destroy();
});
