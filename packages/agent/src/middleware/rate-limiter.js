/**
 * Token Bucket Rate Limiter Middleware
 * Implements per-IP and per-user rate limiting with configurable limits
 */

class RateLimiter {
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || 60;
    this.requestsPerHour = options.requestsPerHour || 1000;
    this.maxBuckets = options.maxBuckets || 10000; // LRU cap
    this.buckets = new Map();
    this.userBuckets = new Map();

    // Cleanup old buckets every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Get or create bucket for IP/user
   */
  getBucket(key) {
    if (!this.buckets.has(key)) {
      // LRU eviction: if at capacity, remove oldest entry
      if (this.buckets.size >= this.maxBuckets) {
        const oldest = this.buckets.keys().next().value;
        this.buckets.delete(oldest);
      }
      this.buckets.set(key, {
        minute: { tokens: this.requestsPerMinute, resetAt: Date.now() + 60000 },
        hour: { tokens: this.requestsPerHour, resetAt: Date.now() + 3600000 },
        lastSeen: Date.now(),
      });
    } else {
      // Move to end for LRU ordering (Map preserves insertion order)
      const bucket = this.buckets.get(key);
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
    }
    return this.buckets.get(key);
  }

  /**
   * Check if request is allowed based on rate limits
   */
  isAllowed(ip, userId = null) {
    const now = Date.now();

    // Use user-specific bucket if available, otherwise IP-based
    const key = userId ? `user:${userId}` : `ip:${ip}`;
    const bucket = this.getBucket(key);

    // Reset minute bucket if expired
    if (now > bucket.minute.resetAt) {
      bucket.minute.tokens = this.requestsPerMinute;
      bucket.minute.resetAt = now + 60000;
    }

    // Reset hour bucket if expired
    if (now > bucket.hour.resetAt) {
      bucket.hour.tokens = this.requestsPerHour;
      bucket.hour.resetAt = now + 3600000;
    }

    // Update last seen
    bucket.lastSeen = now;

    // Check if we have tokens available (fail-closed: deny if either bucket empty)
    if (bucket.minute.tokens > 0 && bucket.hour.tokens > 0) {
      bucket.minute.tokens--;
      bucket.hour.tokens--;
      return {
        allowed: true,
        remaining: bucket.minute.tokens,
        retryAfter: null,
      };
    }

    // Rate limited - return retry-after info
    const retryAfter =
      Math.ceil(
        (bucket.minute.tokens === 0
          ? bucket.minute.resetAt
          : bucket.hour.resetAt) - now,
      ) / 1000;
    return { allowed: false, remaining: 0, retryAfter };
  }

  /**
   * Clean up old buckets to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastSeen > maxAge) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Destroy rate limiter (cleanup interval)
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

/**
 * Create rate limiter middleware
 */
function createRateLimiterMiddleware(limiter, opts = {}) {
  const trustProxy = opts.trustProxy === true;

  function getClientIp(req) {
    if (trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
      }
    }
    return (
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      req.ip ||
      "0.0.0.0"
    );
  }

  return (req, res, next) => {
    // Extract client IP; only trust forwarded headers when explicitly enabled.
    const ip = getClientIp(req);

    // Extract user ID from JWT if available
    const userId = req.user?.userId || null;

    // Check rate limit
    const check = limiter.isAllowed(ip, userId);

    if (!check.allowed) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": check.retryAfter,
        "X-RateLimit-Limit": limiter.requestsPerMinute,
        "X-RateLimit-Remaining": check.remaining,
        "X-RateLimit-Reset": new Date(
          Date.now() + check.retryAfter * 1000,
        ).toISOString(),
      });
      res.end(
        JSON.stringify({
          error: "Too Many Requests",
          retryAfter: check.retryAfter,
          message: `Rate limit exceeded. Try again in ${check.retryAfter}s.`,
        }),
      );
      return;
    }

    // Attach rate limit info to response
    res.setHeader("X-RateLimit-Limit", limiter.requestsPerMinute);
    res.setHeader("X-RateLimit-Remaining", check.remaining);

    next();
  };
}

module.exports = { RateLimiter, createRateLimiterMiddleware };
