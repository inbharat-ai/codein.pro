const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

/**
 * @class HTTPPoolManager
 * @description HTTP/HTTPS connection pooling with keep-alive and request tracking
 * @extends EventEmitter
 * @example
 * const pool = new HTTPPoolManager({ maxSockets: 10, timeout: 30000 });
 * const data = await pool.request('https://api.example.com/data');
 */
class HTTPPoolManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxSockets = options.maxSockets || 10;
    this.timeout = options.timeout || 30000;
    this.keepAliveTimeout = options.keepAliveTimeout || 60000;

    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: this.maxSockets,
      maxFreeSockets: Math.ceil(this.maxSockets / 2),
      timeout: this.timeout,
      keepAliveMsecs: 30000,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: this.maxSockets,
      maxFreeSockets: Math.ceil(this.maxSockets / 2),
      timeout: this.timeout,
      keepAliveMsecs: 30000,
    });

    this.requestStats = {
      total: 0,
      completed: 0,
      failed: 0,
      timeout: 0,
      totalDuration: 0,
      averageDuration: 0,
      activeRequests: 0,
    };

    this.activeRequests = new Map();
  }

  /**
   * Make HTTP/HTTPS request with pooling
   * @param {string} url - URL to request
   * @param {Object} options - Request options
   * @returns {Promise} Response data
   */
  async request(url, options = {}) {
    const {
      method = "GET",
      body = null,
      headers = {},
      timeout = this.timeout,
      json = true,
    } = options;

    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    this.requestStats.total++;
    this.requestStats.activeRequests++;

    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const agent = isHttps ? this.httpsAgent : this.httpAgent;

    return new Promise((resolve, reject) => {
      const requestOptions = {
        method,
        headers: {
          "User-Agent": "CodIn-HTTPPool/1.0",
          ...headers,
        },
        agent,
        timeout,
      };

      const timeoutId = setTimeout(() => {
        this.requestStats.timeout++;
        this.requestStats.activeRequests--;
        this.removeActiveRequest(requestId);
        this.emit("request-timeout", {
          url,
          requestId,
          duration: Date.now() - startTime,
        });
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      const req = (isHttps ? https : http).request(
        url,
        requestOptions,
        (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            clearTimeout(timeoutId);
            const duration = Date.now() - startTime;

            this.requestStats.completed++;
            this.requestStats.activeRequests--;
            this.requestStats.totalDuration += duration;
            this.requestStats.averageDuration =
              this.requestStats.totalDuration / this.requestStats.completed;

            this.removeActiveRequest(requestId);
            this.emit("request-complete", {
              url,
              requestId,
              status: res.statusCode,
              duration,
            });

            try {
              if (json) {
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  data: JSON.parse(data),
                  raw: data,
                });
              } else {
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  data: data,
                  raw: data,
                });
              }
            } catch (error) {
              reject(new Error(`Failed to parse response: ${error.message}`));
            }
          });
        },
      );

      req.on("error", (error) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        this.requestStats.failed++;
        this.requestStats.activeRequests--;

        this.removeActiveRequest(requestId);
        this.emit("request-error", {
          url,
          requestId,
          error: error.message,
          duration,
        });
        reject(error);
      });

      if (body) {
        if (typeof body === "object") {
          req.write(JSON.stringify(body));
        } else {
          req.write(body);
        }
      }

      this.addActiveRequest(requestId, {
        url,
        method,
        startTime,
        timeout,
      });

      req.end();
    });
  }

  /**
   * Batch requests with concurrency limit
   * @param {Array} requests - Array of {url, options}
   * @param {number} concurrency - Max concurrent requests
   * @returns {Promise} Array of results
   */
  async batch(requests, concurrency = 5) {
    const results = [];
    const executing = [];

    for (const request of requests) {
      const promise = this.request(request.url, request.options)
        .then((result) => ({
          success: true,
          url: request.url,
          result,
        }))
        .catch((error) => ({
          success: false,
          url: request.url,
          error: error.message,
        }));

      results.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex((p) => p === executing[0]),
          1,
        );
      }

      executing.push(promise);
    }

    return Promise.all(results);
  }

  /**
   * Track active request
   * @private
   */
  addActiveRequest(id, data) {
    this.activeRequests.set(id, data);
  }

  /**
   * Remove active request
   * @private
   */
  removeActiveRequest(id) {
    this.activeRequests.delete(id);
  }

  /**
   * Get pool statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.requestStats,
      averageDuration: Math.round(this.requestStats.averageDuration),
      activeRequests: this.requestStats.activeRequests,
      successRate:
        this.requestStats.total > 0
          ? (
              (this.requestStats.completed / this.requestStats.total) *
              100
            ).toFixed(2) + "%"
          : "N/A",
      httpSockets: {
        total: this.httpAgent.sockets
          ? Object.keys(this.httpAgent.sockets).length
          : 0,
        free: this.httpAgent.freeSockets
          ? Object.keys(this.httpAgent.freeSockets).length
          : 0,
      },
      httpsSockets: {
        total: this.httpsAgent.sockets
          ? Object.keys(this.httpsAgent.sockets).length
          : 0,
        free: this.httpsAgent.freeSockets
          ? Object.keys(this.httpsAgent.freeSockets).length
          : 0,
      },
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestStats = {
      total: 0,
      completed: 0,
      failed: 0,
      timeout: 0,
      totalDuration: 0,
      averageDuration: 0,
      activeRequests: this.requestStats.activeRequests,
    };
    this.emit("stats-reset", { timestamp: Date.now() });
  }

  /**
   * Destroy pool and close sockets
   */
  destroy() {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    this.activeRequests.clear();
    this.emit("destroy", { timestamp: Date.now() });
  }

  /**
   * Get active requests
   * @returns {Object[]} Array of active requests
   */
  getActiveRequests() {
    return Array.from(this.activeRequests.values());
  }
}

module.exports = { HTTPPoolManager };
