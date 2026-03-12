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
   * Match a request against registered routes.
   * Supports API versioning: requests to /v1/foo will match route /foo.
   * Both versioned (/v1/...) and unversioned paths are accepted for
   * backward compatibility, but clients should prefer /v1/.
   *
   * @param {string} method
   * @param {string} pathname
   * @returns {{ handler: Function, params: Object, apiVersion?: string }|null}
   */
  match(method, pathname) {
    // Strip /v1 prefix if present — normalise to unversioned for matching
    let normalised = pathname;
    let apiVersion = null;
    const versionMatch = pathname.match(/^\/v(\d+)(\/.*)/);
    if (versionMatch) {
      apiVersion = `v${versionMatch[1]}`;
      normalised = versionMatch[2] || "/";
    }

    const result = this._matchPath(method, normalised);
    if (result) {
      result.apiVersion = apiVersion;
      return result;
    }

    // If the request had no version prefix, still try the raw pathname
    // (already tried above when normalised === pathname)
    return null;
  }

  /**
   * Internal path matcher against registered routes.
   * @private
   */
  _matchPath(method, pathname) {
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
