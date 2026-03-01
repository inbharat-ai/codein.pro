const { EventEmitter } = require("events");

/**
 * @class ResponseStreamer
 * @description Streams responses via Server-Sent Events (SSE) with backpressure handling
 * @extends EventEmitter
 * @example
 * const streamer = new ResponseStreamer();
 * streamer.stream(res, tokenGenerator, { timeout: 30000 });
 */
class ResponseStreamer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.bufferSize = options.bufferSize || 100;
    this.backpressureThreshold = options.backpressureThreshold || 50;
    this.timeout = options.timeout || 60000;
    this.statsInterval = options.statsInterval || 10000;

    this.stats = {
      streamsActive: 0,
      tokensStreamed: 0,
      streamsCompleted: 0,
      streamsErrors: 0,
      totalDuration: 0,
      averageDuration: 0,
    };

    this.startStatsTimer();
  }

  /**
   * Stream tokens to HTTP response via SSE
   * @param {Object} res - Express response object
   * @param {AsyncGenerator|Function} generator - Token generator function
   * @param {Object} options - Stream options
   */
  async stream(res, generator, options = {}) {
    const {
      timeout = this.timeout,
      onToken = null,
      onError = null,
      onComplete = null,
      chunkSize = 1,
    } = options;

    const streamId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Stream-ID", streamId);
    res.setHeader("Access-Control-Allow-Origin", "*");

    this.stats.streamsActive++;
    this.emit("stream-start", { streamId, timestamp: Date.now() });

    const timeoutId = setTimeout(() => {
      res.write(this.formatEvent("error", { message: "Stream timeout" }));
      res.end();
      this.stats.streamsErrors++;
      this.stats.streamsActive--;
      this.emit("stream-timeout", {
        streamId,
        duration: Date.now() - startTime,
      });

      if (onError) {
        onError(new Error("Stream timeout"));
      }
    }, timeout);

    try {
      let buffer = [];
      let isPaused = false;

      const getTokens = async () => {
        if (typeof generator === "function") {
          return await generator();
        } else if (generator[Symbol.asyncIterator]) {
          const result = await generator.next();
          return result.value;
        }
        return null;
      };

      while (true) {
        let token;
        try {
          token = await getTokens();
        } catch (error) {
          throw error;
        }

        if (token === null || token === undefined) {
          if (buffer.length > 0) {
            res.write(this.formatEvent("chunk", { tokens: buffer }));
            this.stats.tokensStreamed += buffer.length;
            buffer = [];
          }
          break;
        }

        buffer.push(token);

        if (buffer.length >= chunkSize) {
          const canContinue = res.write(
            this.formatEvent("chunk", { tokens: buffer }),
          );
          this.stats.tokensStreamed += buffer.length;
          buffer = [];

          if (onToken) {
            onToken(token);
          }

          if (!canContinue && !isPaused) {
            isPaused = true;
            this.emit("backpressure-pause", {
              streamId,
              buffered: buffer.length,
            });

            await new Promise((resolve) => {
              res.once("drain", () => {
                isPaused = false;
                this.emit("backpressure-resume", { streamId });
                resolve();
              });
            });
          }
        }
      }

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;

      res.write(
        this.formatEvent("end", {
          duration,
          tokensStreamed: this.stats.tokensStreamed,
        }),
      );
      res.end();

      this.stats.streamsCompleted++;
      this.stats.streamsActive--;
      this.stats.totalDuration += duration;
      this.stats.averageDuration =
        this.stats.totalDuration / this.stats.streamsCompleted;

      this.emit("stream-complete", {
        streamId,
        duration,
        tokensStreamed: this.stats.tokensStreamed,
      });

      if (onComplete) {
        onComplete({ tokensStreamed: this.stats.tokensStreamed, duration });
      }
    } catch (error) {
      clearTimeout(timeoutId);

      this.handleError(res, error, streamId, startTime, onError);
    }
  }

  /**
   * Handle streaming errors
   * @private
   */
  handleError(res, error, streamId, startTime, onError) {
    const duration = Date.now() - startTime;

    this.stats.streamsErrors++;
    this.stats.streamsActive--;

    try {
      res.write(
        this.formatEvent("error", {
          message: error.message,
          duration,
        }),
      );
      res.end();
    } catch (e) {
      // Response already closed
    }

    this.emit("stream-error", {
      streamId,
      error: error.message,
      duration,
    });

    if (onError) {
      onError(error);
    }
  }

  /**
   * Format token as SSE event
   * @private
   */
  formatEvent(eventType, data) {
    const event = {
      type: eventType,
      data: data,
      timestamp: Date.now(),
    };

    return `data: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Format single token for streaming
   * @param {*} token - Token to format
   * @param {Object} options - Format options
   * @returns {string} Formatted token
   */
  formatToken(token, options = {}) {
    const { addTimestamp = false, includeId = false, id = null } = options;

    const formatted = {
      token,
      ...(addTimestamp && { timestamp: Date.now() }),
      ...(includeId && id && { id }),
    };

    return JSON.stringify(formatted);
  }

  /**
   * Get stream statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      averageDuration: Math.round(this.stats.averageDuration),
      tokensPerSecond:
        this.stats.totalDuration > 0
          ? Math.round(
              (this.stats.tokensStreamed / (this.stats.totalDuration / 1000)) *
                100,
            ) / 100
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      streamsActive: this.stats.streamsActive,
      tokensStreamed: 0,
      streamsCompleted: 0,
      streamsErrors: 0,
      totalDuration: 0,
      averageDuration: 0,
    };
    this.emit("stats-reset", { timestamp: Date.now() });
  }

  /**
   * Start periodic stats collection
   * @private
   */
  startStatsTimer() {
    this.statsTimer = setInterval(() => {
      this.emit("stats-update", this.getStats());
    }, this.statsInterval);

    this.statsTimer.unref();
  }

  /**
   * Stop stats timer
   */
  destroy() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }
  }
}

module.exports = { ResponseStreamer };
