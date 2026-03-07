/**
 * Reliability Utilities
 *
 * Production-grade reliability patterns:
 * - Exponential backoff with jitter
 * - Timeout wrappers
 * - Circuit breakers
 * - Retry policies
 */

"use strict";

/**
 * Retry function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.initialDelayMs=1000] - Initial delay in milliseconds
 * @param {number} [options.maxDelayMs=30000] - Maximum delay cap
 * @param {number} [options.backoffMultiplier=2] - Backoff multiplier (exponential)
 * @param {boolean} [options.jitter=true] - Add random jitter to prevent thundering herd
 * @param {Function} [options.shouldRetry] - Custom retry predicate
 * @param {Function} [options.onRetry] - Callback on each retry
 * @returns {Promise<any>} Result from successful fn call
 * @throws {Error} Last error if all retries exhausted
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitter = true,
    shouldRetry = null,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(error, attempt)) {
        throw error;
      }

      // Last attempt - throw
      if (attempt === maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs,
      );

      // Add jitter to prevent thundering herd
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1, delay);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrap promise with timeout
 *
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} [errorMessage] - Custom timeout error message
 * @returns {Promise<any>} Promise that rejects if timeout exceeded
 */
async function withTimeout(promise, timeoutMs, errorMessage) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          errorMessage ||
            `Operation timed out after ${(timeoutMs / 1000).toFixed(1)}s`,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by failing fast when error rate exceeds threshold.
 * States: CLOSED (normal) → OPEN (failing fast) → HALF_OPEN (testing recovery)
 */
class CircuitBreaker {
  /**
   * @param {Object} options - Circuit breaker configuration
   * @param {number} [options.failureThreshold=5] - Failures before opening
   * @param {number} [options.successThreshold=2] - Successes to close from half-open
   * @param {number} [options.timeout=60000] - Time in OPEN before trying HALF_OPEN (ms)
   * @param {number} [options.windowSize=10] - Rolling window size for failure tracking
   * @param {Function} [options.onStateChange] - Callback when state changes
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000;
    this.windowSize = options.windowSize || 10;
    this.onStateChange = options.onStateChange || null;

    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = 0;
    this.recentResults = []; // Rolling window
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result from fn
   */
  async execute(fn) {
    if (this.state === "OPEN") {
      // Check if we should transition to HALF_OPEN
      if (Date.now() >= this.nextAttemptTime) {
        this._setState("HALF_OPEN");
      } else {
        throw new Error(
          `Circuit breaker is OPEN. Next retry in ${((this.nextAttemptTime - Date.now()) / 1000).toFixed(0)}s`,
        );
      }
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   * @private
   */
  _onSuccess() {
    this.failures = 0;

    if (this.state === "HALF_OPEN") {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this._setState("CLOSED");
        this.successes = 0;
      }
    }

    // Update rolling window
    this.recentResults.push(true);
    if (this.recentResults.length > this.windowSize) {
      this.recentResults.shift();
    }
  }

  /**
   * Handle failed execution
   * @private
   */
  _onFailure() {
    this.failures++;
    this.successes = 0;

    // Update rolling window
    this.recentResults.push(false);
    if (this.recentResults.length > this.windowSize) {
      this.recentResults.shift();
    }

    // Calculate failure rate in window
    const failureCount = this.recentResults.filter((r) => !r).length;
    const failureRate = failureCount / this.recentResults.length;

    // Open circuit if threshold exceeded
    if (
      this.state === "CLOSED" &&
      failureCount >= this.failureThreshold &&
      failureRate > 0.5
    ) {
      this._setState("OPEN");
      this.nextAttemptTime = Date.now() + this.timeout;
    } else if (this.state === "HALF_OPEN") {
      // Single failure in HALF_OPEN → back to OPEN
      this._setState("OPEN");
      this.nextAttemptTime = Date.now() + this.timeout;
    }
  }

  /**
   * Change circuit breaker state
   * @private
   */
  _setState(newState) {
    const oldState = this.state;
    this.state = newState;

    if (oldState !== newState && this.onStateChange) {
      this.onStateChange(oldState, newState);
    }
  }

  /**
   * Get current circuit breaker status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttemptTime:
        this.state === "OPEN"
          ? new Date(this.nextAttemptTime).toISOString()
          : null,
      recentFailureRate:
        this.recentResults.length > 0
          ? (
              this.recentResults.filter((r) => !r).length /
              this.recentResults.length
            ).toFixed(2)
          : 0,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset() {
    this._setState("CLOSED");
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = 0;
    this.recentResults = [];
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} [options.tokensPerInterval=10] - Tokens to add per interval
   * @param {number} [options.interval=1000] - Interval in milliseconds
   * @param {number} [options.maxTokens=10] - Maximum token bucket size
   */
  constructor(options = {}) {
    this.tokensPerInterval = options.tokensPerInterval || 10;
    this.interval = options.interval || 1000;
    this.maxTokens = options.maxTokens || 10;
    this.tokens = this.maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to consume tokens
   * @param {number} [count=1] - Number of tokens to consume
   * @returns {boolean} True if tokens available, false otherwise
   */
  tryConsume(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Wait until tokens available, then consume
   * @param {number} [count=1] - Number of tokens to consume
   * @returns {Promise<void>}
   */
  async consume(count = 1) {
    while (!this.tryConsume(count)) {
      const waitTime = this._timeUntilNextToken();
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Refill token bucket
   * @private
   */
  _refill() {
    const now = Date.now();
    const timePassed = now - this.lastRefillTime;
    const tokensToAdd = (timePassed / this.interval) * this.tokensPerInterval;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * Calculate time until next token available
   * @private
   * @returns {number} Milliseconds until next token
   */
  _timeUntilNextToken() {
    const tokensNeeded = 1;
    const intervalsNeeded = tokensNeeded / this.tokensPerInterval;
    return Math.ceil(intervalsNeeded * this.interval);
  }

  /**
   * Get current rate limiter status
   * @returns {Object}
   */
  getStatus() {
    this._refill();
    return {
      tokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      interval: this.interval,
      tokensPerInterval: this.tokensPerInterval,
    };
  }
}

/**
 * Bulkhead pattern - limit concurrent executions
 */
class Bulkhead {
  /**
   * @param {Object} options
   * @param {number} [options.maxConcurrent=10] - Maximum concurrent executions
   * @param {number} [options.maxQueue=100] - Maximum queue size
   */
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 10;
    this.maxQueue = options.maxQueue || 100;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Execute function with bulkhead protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>}
   */
  async execute(fn) {
    // Check queue capacity
    if (this.queue.length >= this.maxQueue) {
      throw new Error(
        `Bulkhead queue full (${this.maxQueue}). Request rejected.`,
      );
    }

    // Wait for slot
    await new Promise((resolve, reject) => {
      const checkSlot = () => {
        if (this.running < this.maxConcurrent) {
          this.running++;
          resolve();
        } else {
          this.queue.push({ resolve, reject });
        }
      };
      checkSlot();
    });

    try {
      return await fn();
    } finally {
      this.running--;
      this._processQueue();
    }
  }

  /**
   * Process next item in queue
   * @private
   */
  _processQueue() {
    if (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const { resolve } = this.queue.shift();
      this.running++;
      resolve();
    }
  }

  /**
   * Get current bulkhead status
   * @returns {Object}
   */
  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue,
      utilization: ((this.running / this.maxConcurrent) * 100).toFixed(1) + "%",
    };
  }
}

module.exports = {
  retryWithBackoff,
  withTimeout,
  CircuitBreaker,
  RateLimiter,
  Bulkhead,
};
