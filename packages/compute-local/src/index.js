"use strict";

const http = require("node:http");
const { URL, URLSearchParams } = require("node:url");

const DEFAULT_BASE_URL = "http://127.0.0.1:43120";

function enforceLocalOnlyPolicy(policy = {}) {
  const merged = { ...policy };
  merged.allowNetwork = false;
  merged.allowEscalation = false;
  merged.allowBrowser = false;
  merged.allowedDomains = [];
  return merged;
}

class ComputeLocalClient {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async submitJob({ goal, language, audioPath, policy, context } = {}) {
    if (!goal || typeof goal !== "string") {
      throw new Error("goal is required and must be a string");
    }
    const safePolicy = enforceLocalOnlyPolicy(policy);
    return this._request("POST", "/compute/jobs", {
      goal,
      language,
      audioPath,
      policy: safePolicy,
      context,
    });
  }

  async listJobs({ status, limit, offset } = {}) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (typeof limit === "number") params.set("limit", String(limit));
    if (typeof offset === "number") params.set("offset", String(offset));
    const query = params.toString();
    return this._request(
      "GET",
      query ? `/compute/jobs?${query}` : "/compute/jobs",
    );
  }

  async getJob(jobId) {
    return this._request("GET", `/compute/jobs/${jobId}`);
  }

  async deleteJob(jobId) {
    return this._request("DELETE", `/compute/jobs/${jobId}`);
  }

  async cancelJob(jobId) {
    return this._request("POST", `/compute/jobs/${jobId}/cancel`);
  }

  async pauseJob(jobId) {
    return this._request("POST", `/compute/jobs/${jobId}/pause`);
  }

  async resumeJob(jobId) {
    return this._request("POST", `/compute/jobs/${jobId}/resume`);
  }

  async getStats() {
    return this._request("GET", "/compute/stats");
  }

  async listLanguages() {
    return this._request("GET", "/compute/languages");
  }

  async runWorkflow(name, body = {}) {
    const safePolicy = enforceLocalOnlyPolicy(body.policy || {});
    return this._request("POST", `/compute/workflows/${name}`, {
      ...body,
      policy: safePolicy,
    });
  }

  subscribeToJobEvents(jobId, onEvent) {
    return createSseSubscription(this.baseUrl, jobId, onEvent);
  }

  _request(method, pathname, body) {
    const target = new URL(pathname, this.baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          method,
          hostname: target.hostname,
          port: target.port,
          path: target.pathname + target.search,
          headers: payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {},
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString();
          });
          res.on("end", () => {
            if (!data) {
              return resolve({});
            }
            try {
              const parsed = JSON.parse(data);
              if (!res.statusCode || res.statusCode >= 400) {
                const err =
                  parsed?.error || `Request failed (${res.statusCode})`;
                return reject(new Error(err));
              }
              resolve(parsed);
            } catch (err) {
              if (!res.statusCode || res.statusCode >= 400) {
                return reject(
                  new Error(data || `Request failed (${res.statusCode})`),
                );
              }
              resolve({ raw: data });
            }
          });
        },
      );

      req.on("error", reject);

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }
}

function createSseSubscription(baseUrl, jobId, onEvent) {
  const target = new URL(`/compute/jobs/${jobId}/events`, baseUrl);
  let buffer = "";
  let isClosed = false;

  const req = http.request(
    {
      method: "GET",
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      headers: {
        Accept: "text/event-stream",
      },
    },
    (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        // SSE spec allows \n\n, \r\n\r\n, or \r\r as event boundaries
        // Normalise \r\n → \n and \r → \n for consistent parsing
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const packet = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          handleSsePacket(packet, onEvent);
          boundary = buffer.indexOf("\n\n");
        }
      });
      res.on("end", () => {
        if (!isClosed) {
          onEvent({ event: "closed", data: { reason: "stream ended" } });
        }
      });
    },
  );

  req.on("error", (err) => {
    if (!isClosed) {
      onEvent({ event: "error", data: { message: err.message } });
    }
  });

  req.end();

  return {
    close: () => {
      isClosed = true;
      try {
        req.destroy();
      } catch {
        // ignore
      }
    },
  };
}

function handleSsePacket(packet, onEvent) {
  if (!packet.trim() || packet.startsWith(":")) {
    return;
  }

  let eventName = "message";
  let dataPayload = "";

  const lines = packet.split("\n");
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      // Per SSE spec, multiple data: lines are joined with '\n'
      if (dataPayload) dataPayload += "\n";
      dataPayload += line.slice("data:".length).trim();
    }
  }

  const data = safeJsonParse(dataPayload);
  onEvent({ event: eventName, data });
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

module.exports = {
  ComputeLocalClient,
  enforceLocalOnlyPolicy,
};
