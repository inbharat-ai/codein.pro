/**
 * CodeIn Media Toolkit — Media Service IPC Client
 *
 * Communicates with the local Python FastAPI media service.
 * All calls go to http://127.0.0.1:{port}/...
 */

"use strict";

const http = require("http");
const path = require("path");
const fs = require("fs");

const DEFAULT_PORT = 43130;
const REQUEST_TIMEOUT = 600_000; // 10 min max for video gen

class MediaServiceClient {
  /**
   * @param {Object} opts
   * @param {number} opts.port
   * @param {string} opts.host
   */
  constructor({ port = DEFAULT_PORT, host = "127.0.0.1" } = {}) {
    this.port = port;
    this.host = host;
    this.baseUrl = `http://${host}:${port}`;
    this._abortControllers = new Map(); // jobId → AbortController
  }

  // ── HTTP helper ─────────────────────────────────────────

  /**
   * @param {string} method
   * @param {string} urlPath
   * @param {Object|null} body
   * @param {AbortSignal|null} signal
   * @returns {Promise<Object>}
   */
  _request(method, urlPath, body = null, signal = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.baseUrl);
      const opts = {
        method,
        hostname: this.host,
        port: this.port,
        path: url.pathname + url.search,
        headers: { "Content-Type": "application/json" },
        timeout: REQUEST_TIMEOUT,
      };

      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ raw: data, status: res.statusCode });
          }
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Media service request timed out"));
      });

      if (signal) {
        signal.addEventListener("abort", () => {
          req.destroy();
          reject(new Error("Request aborted"));
        });
      }

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // ── Health ──────────────────────────────────────────────

  /** @returns {Promise<{status: string, gpu_available: boolean, models_loaded: string[]}>} */
  async health() {
    return this._request("GET", "/health");
  }

  /** @returns {Promise<boolean>} */
  async isAlive() {
    try {
      const res = await this._request("GET", "/health");
      return res?.status === "ok";
    } catch {
      return false;
    }
  }

  // ── Models ──────────────────────────────────────────────

  /** @returns {Promise<Object>} */
  async modelsStatus() {
    return this._request("GET", "/models/status");
  }

  /**
   * Download / prepare a model.
   * @param {string} modelId - HuggingFace model ID
   * @returns {Promise<Object>}
   */
  async downloadModel(modelId) {
    return this._request("POST", "/models/download", { model_id: modelId });
  }

  /**
   * Delete a cached model.
   * @param {string} modelId
   * @returns {Promise<Object>}
   */
  async deleteModel(modelId) {
    return this._request("DELETE", "/models/delete", { model_id: modelId });
  }

  // ── Image generation ────────────────────────────────────

  /**
   * Generate an image.
   *
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.negative_prompt
   * @param {string} params.model_id
   * @param {number} params.width
   * @param {number} params.height
   * @param {number} params.steps
   * @param {number} params.guidance_scale
   * @param {number} params.seed
   * @param {string} params.out_path - absolute path to save output
   * @param {string} params.device   - 'auto' | 'cpu' | 'cuda' | 'mps'
   * @param {string} [params.job_id] - optional tracking ID
   * @returns {Promise<{success: boolean, output_path: string, seed: number, time_seconds: number, error?: string}>}
   */
  async generateImage(params) {
    const ac = new AbortController();
    if (params.job_id) this._abortControllers.set(params.job_id, ac);
    try {
      return await this._request("POST", "/generate/image", params, ac.signal);
    } finally {
      if (params.job_id) this._abortControllers.delete(params.job_id);
    }
  }

  // ── Video generation ────────────────────────────────────

  /**
   * Generate a video (image-to-video or text-to-video).
   *
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.model_id
   * @param {string} params.input_image_path - for img2vid
   * @param {number} params.duration_seconds
   * @param {number} params.fps
   * @param {number} params.width
   * @param {number} params.height
   * @param {number} params.seed
   * @param {string} params.out_path
   * @param {string} params.device
   * @param {string} [params.job_id]
   * @returns {Promise<Object>}
   */
  async generateVideo(params) {
    const ac = new AbortController();
    if (params.job_id) this._abortControllers.set(params.job_id, ac);
    try {
      return await this._request("POST", "/generate/video", params, ac.signal);
    } finally {
      if (params.job_id) this._abortControllers.delete(params.job_id);
    }
  }

  // ── Diagram rendering ───────────────────────────────────

  /**
   * Render a diagram (delegated to Python service for consistency,
   * but can also be done client-side with mermaid-js).
   *
   * @param {Object} params
   * @param {string} params.engine   - 'mermaid' | 'plantuml' | 'd2'
   * @param {string} params.source   - diagram source code
   * @param {string} params.format   - 'svg' | 'png'
   * @param {string} params.out_path
   * @returns {Promise<Object>}
   */
  async renderDiagram(params) {
    return this._request("POST", "/generate/diagram", params);
  }

  // ── Cancel ──────────────────────────────────────────────

  /**
   * Cancel a running generation.
   * @param {string} jobId
   * @returns {boolean} true if controller existed and was aborted
   */
  cancelJob(jobId) {
    const ac = this._abortControllers.get(jobId);
    if (ac) {
      ac.abort();
      this._abortControllers.delete(jobId);
      return true;
    }
    // Also tell the service to cancel server-side
    this._request("POST", "/cancel", { job_id: jobId }).catch(() => {});
    return false;
  }

  // ── Progress (SSE) ──────────────────────────────────────

  /**
   * Subscribe to generation progress via SSE.
   * @param {string} jobId
   * @param {function(Object): void} onProgress
   * @returns {function(): void} unsubscribe
   */
  subscribeProgress(jobId, onProgress) {
    let destroyed = false;
    let lastDataTime = Date.now();
    const HEARTBEAT_TIMEOUT = 60_000; // 60 seconds
    const INACTIVITY_TIMEOUT = 120_000; // 2 minutes

    const req = http.get(`${this.baseUrl}/progress/${jobId}`, (res) => {
      let buffer = "";

      // Set timeout for inactivity
      const inactivityTimer = setInterval(() => {
        if (Date.now() - lastDataTime > INACTIVITY_TIMEOUT) {
          req.destroy();
          if (!destroyed)
            onProgress({
              event: "error",
              message: "Progress subscription timed out (no data received)",
            });
          destroyed = true;
        }
      }, HEARTBEAT_TIMEOUT);

      res.on("data", (chunk) => {
        if (destroyed) return;
        lastDataTime = Date.now();
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.replace(/\r$/, "");
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              onProgress(data);
            } catch {
              /* skip malformed */
            }
          }
        }
      });
      res.on("end", () => {
        clearInterval(inactivityTimer);
        if (!destroyed) onProgress({ event: "done" });
      });
    });

    req.setTimeout(INACTIVITY_TIMEOUT, () => {
      req.destroy();
      if (!destroyed)
        onProgress({ event: "error", message: "Progress stream timeout" });
      destroyed = true;
    });

    req.on("error", () => {
      if (!destroyed)
        onProgress({
          event: "error",
          message: "Connection to media service lost",
        });
    });

    return () => {
      destroyed = true;
      req.destroy();
    };
  }
}

module.exports = { MediaServiceClient, DEFAULT_PORT };
