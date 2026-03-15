/**
 * CodeIn MAS — Streaming Response Engine
 *
 * Provides real-time, granular event streaming from agent execution to the GUI.
 * Replaces polling-based task status checks with SSE-powered live updates.
 *
 * Architecture:
 *   StreamEngine  — singleton registry of per-task streams
 *   TaskStream    — per-task event buffer + EventEmitter
 *   SSE handler   — Express middleware that replays + subscribes to a TaskStream
 *
 * All events follow a uniform envelope:
 *   { id, type, timestamp, taskId, data }
 *
 * @module stream-engine
 */
"use strict";

const { EventEmitter } = require("node:events");
const crypto = require("node:crypto");
const { createLogger } = require("./logger");

const log = createLogger("StreamEngine");

/* ------------------------------------------------------------------ */
/*  Event type constants                                               */
/* ------------------------------------------------------------------ */

/** @readonly */
const STREAM_EVENT = Object.freeze({
  THINKING: "thinking",
  TOOL_CALL: "tool_call",
  TOOL_RESULT: "tool_result",
  CODE_WRITE: "code_write",
  PROGRESS: "progress",
  NODE_START: "node_start",
  NODE_COMPLETE: "node_complete",
  NODE_ERROR: "node_error",
  COST_UPDATE: "cost_update",
  FINAL: "final",
  HEARTBEAT: "heartbeat",
});

/* ------------------------------------------------------------------ */
/*  TaskStream                                                         */
/* ------------------------------------------------------------------ */

/**
 * Per-task event stream that buffers structured events and exposes typed
 * emit helpers.  Listeners receive every event through the generic
 * `"event"` channel.
 *
 * @extends EventEmitter
 */
class TaskStream extends EventEmitter {
  /**
   * @param {object}  opts
   * @param {string}  opts.taskId     — unique task identifier
   * @param {number} [opts.maxBuffer] — max events to retain (FIFO)
   */
  constructor({ taskId, maxBuffer = 1000 }) {
    super();
    /** @type {string} */
    this.taskId = taskId;
    /** @type {number} */
    this._maxBuffer = maxBuffer;
    /** @type {Array<object>} */
    this._buffer = [];
    /** @type {boolean} */
    this._closed = false;

    this._log = createLogger("TaskStream").child({ taskId });
  }

  /* ---------- internal helpers ------------------------------------ */

  /**
   * Build the canonical event envelope, buffer it, and emit.
   *
   * @param   {string} type — one of STREAM_EVENT values
   * @param   {object} data — type-specific payload
   * @returns {object}        the structured event
   * @private
   */
  _push(type, data) {
    if (this._closed) {
      this._log.warn("Attempted to emit on a closed stream", { type });
      return null;
    }

    const event = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      taskId: this.taskId,
      data,
    };

    // FIFO cap
    if (this._buffer.length >= this._maxBuffer) {
      this._buffer.shift();
    }
    this._buffer.push(event);

    this.emit("event", event);
    return event;
  }

  /* ---------- typed emitters -------------------------------------- */

  /**
   * Agent is actively reasoning / chain-of-thought.
   *
   * @param {string} agentId   — which agent instance
   * @param {string} agentType — e.g. "planner", "coder", "reviewer"
   * @param {string} content   — thinking text
   * @returns {object|null} the emitted event
   */
  emitThinking(agentId, agentType, content) {
    return this._push(STREAM_EVENT.THINKING, { agentId, agentType, content });
  }

  /**
   * Agent is invoking a tool.
   *
   * @param {string} agentId  — which agent instance
   * @param {string} toolName — tool being called
   * @param {object} args     — arguments passed to the tool
   * @returns {object|null}
   */
  emitToolCall(agentId, toolName, args) {
    return this._push(STREAM_EVENT.TOOL_CALL, { agentId, toolName, args });
  }

  /**
   * Tool execution completed.
   *
   * @param {string} agentId  — which agent instance
   * @param {string} toolName — tool that ran
   * @param {*}      result   — tool output
   * @param {number} duration — execution time in ms
   * @returns {object|null}
   */
  emitToolResult(agentId, toolName, result, duration) {
    return this._push(STREAM_EVENT.TOOL_RESULT, {
      agentId,
      toolName,
      result,
      duration,
    });
  }

  /**
   * Agent wrote or modified a file.
   *
   * @param {string} agentId  — which agent instance
   * @param {string} filePath — absolute path written
   * @param {string} language — file language / extension
   * @param {string} content  — full file content (or relevant excerpt)
   * @param {string} [diff]   — unified diff if available
   * @returns {object|null}
   */
  emitCodeWrite(agentId, filePath, language, content, diff) {
    return this._push(STREAM_EVENT.CODE_WRITE, {
      agentId,
      filePath,
      language,
      content,
      diff: diff ?? null,
    });
  }

  /**
   * General progress update (e.g. "Analyzing 3 / 10 files").
   *
   * @param {string} agentId — which agent instance
   * @param {string} message — human-readable progress text
   * @param {number} percent — 0-100
   * @returns {object|null}
   */
  emitProgress(agentId, message, percent) {
    return this._push(STREAM_EVENT.PROGRESS, { agentId, message, percent });
  }

  /**
   * A DAG / pipeline node started executing.
   *
   * @param {string} nodeId    — node identifier
   * @param {string} agentType — agent type handling the node
   * @param {string} goal      — what the node is doing
   * @returns {object|null}
   */
  emitNodeStart(nodeId, agentType, goal) {
    return this._push(STREAM_EVENT.NODE_START, { nodeId, agentType, goal });
  }

  /**
   * Node execution completed successfully.
   *
   * @param {string} nodeId — node identifier
   * @param {*}      result — node output
   * @returns {object|null}
   */
  emitNodeComplete(nodeId, result) {
    return this._push(STREAM_EVENT.NODE_COMPLETE, { nodeId, result });
  }

  /**
   * Node execution failed.
   *
   * @param {string}       nodeId — node identifier
   * @param {string|Error} error  — error description or Error instance
   * @returns {object|null}
   */
  emitNodeError(nodeId, error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return this._push(STREAM_EVENT.NODE_ERROR, {
      nodeId,
      error: message,
      stack: stack ?? null,
    });
  }

  /**
   * Running cost update for the task.
   *
   * @param {number} totalCost  — cumulative USD cost
   * @param {object} breakdown  — per-model or per-agent breakdown
   * @returns {object|null}
   */
  emitCostUpdate(totalCost, breakdown) {
    return this._push(STREAM_EVENT.COST_UPDATE, { totalCost, breakdown });
  }

  /**
   * Task has reached a terminal state.
   *
   * @param {string} status  — "completed" | "failed" | "cancelled"
   * @param {*}      results — final output payload
   * @returns {object|null}
   */
  emitFinal(status, results) {
    const event = this._push(STREAM_EVENT.FINAL, { status, results });
    // Auto-close the stream once a terminal event is emitted.
    this._closed = true;
    this.emit("close");
    return event;
  }

  /* ---------- query / utility ------------------------------------- */

  /**
   * Returns a shallow copy of the event buffer.
   * @returns {Array<object>}
   */
  getBuffer() {
    return this._buffer.slice();
  }

  /**
   * Whether this stream has been closed (terminal event sent or
   * explicitly closed by the engine).
   * @returns {boolean}
   */
  get closed() {
    return this._closed;
  }

  /**
   * Mark the stream as closed without emitting a FINAL event.
   * Useful for external cancellation / cleanup.
   */
  close() {
    if (this._closed) return;
    this._closed = true;
    this.emit("close");
    this.removeAllListeners();
  }

  /**
   * Format an event envelope as an SSE-compatible string.
   *
   * Spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
   *
   * @param {object} event — structured event envelope
   * @returns {string} SSE-formatted string ready to write to the response
   */
  toSSE(event) {
    const json = JSON.stringify(event.data);
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${json}\n\n`;
  }
}

/* ------------------------------------------------------------------ */
/*  StreamEngine                                                       */
/* ------------------------------------------------------------------ */

/**
 * Top-level registry that manages one {@link TaskStream} per active task
 * and exposes an SSE handler factory for Express routes.
 *
 * @extends EventEmitter
 */
class StreamEngine extends EventEmitter {
  /**
   * @param {object}  [opts]
   * @param {number}  [opts.maxBuffer=1000] — default buffer size for new streams
   */
  constructor({ maxBuffer = 1000 } = {}) {
    super();
    /** @type {number} */
    this._maxBuffer = maxBuffer;
    /** @type {Map<string, TaskStream>} */
    this._streams = new Map();

    log.info("StreamEngine initialised", { maxBuffer });
  }

  /**
   * Create a new TaskStream for a task.  Throws if a stream already exists
   * for the given taskId (call {@link closeStream} first if re-use is needed).
   *
   * @param {string} taskId
   * @returns {TaskStream}
   */
  createStream(taskId) {
    if (this._streams.has(taskId)) {
      const existing = this._streams.get(taskId);
      if (!existing.closed) {
        log.warn("Stream already exists for task — returning existing", {
          taskId,
        });
        return existing;
      }
      // Closed stream still in map — clean it up and create fresh.
      this._streams.delete(taskId);
    }

    const stream = new TaskStream({ taskId, maxBuffer: this._maxBuffer });

    // Auto-cleanup when the stream closes.
    stream.once("close", () => {
      log.debug("TaskStream closed, removing from registry", { taskId });
      this._streams.delete(taskId);
      this.emit("streamClosed", taskId);
    });

    this._streams.set(taskId, stream);
    this.emit("streamCreated", taskId, stream);
    log.info("TaskStream created", { taskId });
    return stream;
  }

  /**
   * Retrieve an existing stream.
   *
   * @param {string} taskId
   * @returns {TaskStream|undefined}
   */
  getStream(taskId) {
    return this._streams.get(taskId);
  }

  /**
   * Explicitly close and remove a stream.
   *
   * @param {string} taskId
   * @returns {boolean} true if a stream was found and closed
   */
  closeStream(taskId) {
    const stream = this._streams.get(taskId);
    if (!stream) return false;
    stream.close();
    // The "close" listener above handles map removal.
    return true;
  }

  /**
   * Returns an Express-compatible `(req, res)` handler that serves
   * Server-Sent Events for the given task.
   *
   * Usage:
   * ```js
   * app.get("/api/tasks/:id/stream", (req, res) => {
   *   const handler = engine.createSSEHandler(req.params.id);
   *   handler(req, res);
   * });
   * ```
   *
   * @param {string} taskId
   * @returns {function(req: object, res: object): void}
   */
  createSSEHandler(taskId) {
    return (req, res) => {
      const stream = this._streams.get(taskId);

      if (!stream) {
        res.status(404).json({ error: "No active stream for this task" });
        return;
      }

      /* -- SSE headers -------------------------------------------- */
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable nginx buffering
      });

      /* -- Replay buffered events --------------------------------- */
      const buffered = stream.getBuffer();
      for (const event of buffered) {
        res.write(stream.toSSE(event));
      }

      /* -- Subscribe to live events ------------------------------- */
      /** @param {object} event */
      const onEvent = (event) => {
        try {
          res.write(stream.toSSE(event));
        } catch {
          // Client probably disconnected — handled by "close" below.
        }
      };
      stream.on("event", onEvent);

      /* -- Heartbeat to keep the connection alive ------------------ */
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = {
            id: crypto.randomUUID(),
            type: STREAM_EVENT.HEARTBEAT,
            timestamp: Date.now(),
            taskId,
            data: {},
          };
          res.write(
            `id: ${heartbeat.id}\nevent: ${STREAM_EVENT.HEARTBEAT}\ndata: {}\n\n`,
          );
        } catch {
          // Connection gone — cleanup happens in "close".
        }
      }, 15_000);

      /* -- Stream closed (terminal event or engine cleanup) ------- */
      const onStreamClose = () => {
        clearInterval(heartbeatInterval);
        stream.removeListener("event", onEvent);
        try {
          res.end();
        } catch {
          // Already closed.
        }
      };
      stream.once("close", onStreamClose);

      /* -- Client disconnected ------------------------------------ */
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        stream.removeListener("event", onEvent);
        stream.removeListener("close", onStreamClose);
        log.debug("SSE client disconnected", { taskId });
      };

      req.on("close", cleanup);
      res.on("close", cleanup);

      log.info("SSE client connected", {
        taskId,
        bufferedEvents: buffered.length,
      });
    };
  }

  /**
   * Number of currently active (non-closed) streams.
   * @returns {number}
   */
  get activeCount() {
    return this._streams.size;
  }

  /**
   * Close all active streams and remove them.
   */
  closeAll() {
    for (const taskId of [...this._streams.keys()]) {
      this.closeStream(taskId);
    }
    log.info("All streams closed");
  }
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

module.exports = { StreamEngine, TaskStream, STREAM_EVENT };
