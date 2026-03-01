/**
 * Minimal pattern-matching HTTP router for CodIn Agent
 * Replaces the monolithic if-chain in index.js with a clean, modular approach.
 */

class MicroRouter {
  constructor() {
    /** @type {Array<{method: string, pattern: string|RegExp, handler: Function}>} */
    this.routes = [];
  }

  /**
   * Register a route handler
   * @param {"GET"|"POST"|"PUT"|"DELETE"|"PATCH"} method
   * @param {string|RegExp} pattern - Exact path string or regex
   * @param {Function} handler - async (req, res, ctx) => void
   */
  add(method, pattern, handler) {
    this.routes.push({ method: method.toUpperCase(), pattern, handler });
    return this;
  }

  get(pattern, handler) {
    return this.add("GET", pattern, handler);
  }
  post(pattern, handler) {
    return this.add("POST", pattern, handler);
  }
  put(pattern, handler) {
    return this.add("PUT", pattern, handler);
  }
  del(pattern, handler) {
    return this.add("DELETE", pattern, handler);
  }

  /**
   * Match a request against registered routes
   * @param {string} method
   * @param {string} pathname
   * @returns {{ handler: Function, params: Object }|null}
   */
  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue;

      if (typeof route.pattern === "string") {
        if (route.pattern === pathname) {
          return { handler: route.handler, params: {} };
        }

        // Simple :param matching  e.g. /run/:id/stop
        const patternParts = route.pattern.split("/");
        const pathParts = pathname.split("/");
        if (patternParts.length !== pathParts.length) continue;

        const params = {};
        let matched = true;
        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(":")) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
          } else if (patternParts[i] !== pathParts[i]) {
            matched = false;
            break;
          }
        }
        if (matched) return { handler: route.handler, params };
      } else if (route.pattern instanceof RegExp) {
        const m = pathname.match(route.pattern);
        if (m) {
          return { handler: route.handler, params: m.groups || {} };
        }
      }
    }
    return null;
  }
}

module.exports = { MicroRouter };
