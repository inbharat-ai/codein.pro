/**
 * CodeIn Compute — Event Stream *
 * SSE (Server-Sent Events) emitter for job progress.
 * Clients connect via GET /compute/jobs/:jobId/events
 * and receive real-time progress updates.
 */
"use strict";

const { EventEmitter } = require("node:events");

// Event types sent to clients
const EVENT_TYPES = Object.freeze({
  JOB_PROGRESS: "job.progress",
  JOB_STEP: "job.step",
  JOB_LOG: "job.log",
  JOB_ARTIFACT: "job.artifact",
  JOB_ERROR: "job.error",
  JOB_COMPLETE: "job.complete",
  JOB_PAUSED: "job.paused",
  JOB_CANCELLED: "job.cancelled",
  PLAN_READY: "plan.ready",
  STEP_OUTPUT: "step.output",
});

class ComputeEventStream extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // many concurrent SSE connections
    /** @type {Map<string, Set<import("http").ServerResponse>>} */
    this._subscribers = new Map(); // jobId → Set<res>
    this._maxGlobalSubscribers = 5000;
    this._stats = {
      totalEvents: 0,
      activeConnections: 0,
      eventsPerJob: new Map(),
    };
  }

  /**
   * Subscribe an HTTP response to a job's event stream.
   * Sets up SSE headers and keep-alive.
   * @param {string} jobId
   * @param {import("http").ServerResponse} res
   * @param {import("http").IncomingMessage} req - Request object to check origin
   */
  subscribe(jobId, res, req) {
    // Reject before writing SSE headers when global subscriber cap is reached.
    if (this._stats.activeConnections >= this._maxGlobalSubscribers) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many event stream connections" }));
      return;
    }

    // Determine allowed origin (restrict to localhost by default)
    const origin = req.headers.origin || "";
    const isLocalhost =
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes("::1") ||
      origin === "";

    const allowedOrigin = isLocalhost
      ? origin || "http://localhost:43120"
      : "http://localhost:43120"; // Production: only allow localhost

    // Set SSE headers with restricted CORS
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // nginx: disable buffering
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Credentials": "true",
    });

    // Send initial connection event
    this._writeSSE(res, "connected", {
      jobId,
      timestamp: new Date().toISOString(),
      message: "Connected to compute event stream",
    });

    // Register subscriber
    if (!this._subscribers.has(jobId)) {
      this._subscribers.set(jobId, new Set());
    }
    this._subscribers.get(jobId).add(res);
    this._stats.activeConnections++;

    // Keep-alive ping every 30s
    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Cleanup on disconnect
    const cleanup = () => {
      clearInterval(keepAlive);
      const subs = this._subscribers.get(jobId);
      if (subs) {
        subs.delete(res);
        if (subs.size === 0) this._subscribers.delete(jobId);
      }
      this._stats.activeConnections--;
    };

    res.on("close", cleanup);
    res.on("error", cleanup);
  }

  /**
   * Emit an event to all subscribers of a job.
   * @param {string} jobId
   * @param {string} eventType - One of EVENT_TYPES
   * @param {object} data - Event payload
   */
  emit(jobId, eventType, data) {
    // Also emit on the EventEmitter for internal listeners
    super.emit(eventType, { jobId, ...data });
    super.emit("*", { jobId, eventType, ...data });

    const enriched = {
      type: eventType,
      jobId,
      timestamp: new Date().toISOString(),
      data,
    };

    const subs = this._subscribers.get(jobId);
    if (!subs || subs.size === 0) return;

    this._stats.totalEvents++;
    const jobEvents = this._stats.eventsPerJob.get(jobId) || 0;
    this._stats.eventsPerJob.set(jobId, jobEvents + 1);

    const deadConnections = [];
    for (const res of subs) {
      try {
        this._writeSSE(res, eventType, enriched);
      } catch {
        deadConnections.push(res);
      }
    }

    // Clean up dead connections
    for (const res of deadConnections) {
      subs.delete(res);
      this._stats.activeConnections--;
    }
  }

  /**
   * Send a final event and close the connection for a job.
   * @param {string} jobId
   * @param {string} eventType
   * @param {object} data
   */
  complete(jobId, eventType, data) {
    this.emit(jobId, eventType, data);

    const subs = this._subscribers.get(jobId);
    if (subs) {
      for (const res of subs) {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
      this._subscribers.delete(jobId);
      this._stats.eventsPerJob.delete(jobId);
    }
  }

  // ─── Convenience emitters ──────────────────────────────────

  emitJobProgress(jobId, { status, progress, message }) {
    this.emit(jobId, EVENT_TYPES.JOB_PROGRESS, { status, progress, message });
  }

  emitStepUpdate(
    jobId,
    { stepId, status, description, model, confidence, output },
  ) {
    this.emit(jobId, EVENT_TYPES.JOB_STEP, {
      stepId,
      status,
      description,
      model,
      confidence,
      output,
    });
  }

  emitLog(jobId, { level, message, stepId }) {
    this.emit(jobId, EVENT_TYPES.JOB_LOG, { level, message, stepId });
  }

  emitArtifact(jobId, { artifactId, type, name, path, size }) {
    this.emit(jobId, EVENT_TYPES.JOB_ARTIFACT, {
      artifactId,
      type,
      name,
      path,
      size,
    });
  }

  emitError(jobId, { error, stepId, recoverable }) {
    this.emit(jobId, EVENT_TYPES.JOB_ERROR, { error, stepId, recoverable });
  }

  emitPlanReady(jobId, { plan, stepCount }) {
    this.emit(jobId, EVENT_TYPES.PLAN_READY, { plan, stepCount });
  }

  emitStepOutput(jobId, { stepId, chunk, done }) {
    this.emit(jobId, EVENT_TYPES.STEP_OUTPUT, { stepId, chunk, done });
  }

  // ─── Internal ──────────────────────────────────────────────

  _writeSSE(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Get stream statistics.
   */
  getStats() {
    return {
      activeConnections: this._stats.activeConnections,
      totalEvents: this._stats.totalEvents,
      subscribedJobs: this._subscribers.size,
    };
  }

  /**
   * Check if a job has active subscribers.
   */
  hasSubscribers(jobId) {
    const subs = this._subscribers.get(jobId);
    return subs ? subs.size > 0 : false;
  }

  /**
   * Disconnect all subscribers (for shutdown).
   */
  disconnectAll() {
    for (const [jobId, subs] of this._subscribers) {
      for (const res of subs) {
        try {
          this._writeSSE(res, "shutdown", { message: "Server shutting down" });
          res.end();
        } catch {
          /* ignore */
        }
      }
    }
    this._subscribers.clear();
    this._stats.activeConnections = 0;
  }
}

module.exports = {
  ComputeEventStream,
  EVENT_TYPES,
  eventStream: new ComputeEventStream(),
};
