const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

/**
 * @class AuditLogger
 * @description Append-only audit logging with rotation and queryable results
 * @extends EventEmitter
 * @example
 * const audit = new AuditLogger({ logDir: './logs' });
 * await audit.logApiCall({ userId: '123', action: 'login', status: 'success' });
 * const logs = await audit.queryLogs({ userId: '123', startTime: Date.now() - 86400000 });
 */
class AuditLogger extends EventEmitter {
  constructor(options = {}) {
    super();

    this.logDir = options.logDir || path.join(process.cwd(), "logs", "audit");
    this.maxFileSize = options.maxFileSize || 100 * 1024 * 1024; // 100MB
    this.retentionDays = options.retentionDays || 90;
    this.flushInterval = options.flushInterval || 5000;
    this.bufferSize = options.bufferSize || 1024 * 1024; // 1MB

    this.currentFile = null;
    this.buffer = [];
    this.bufferBytes = 0;

    this.stats = {
      totalLogs: 0,
      apiCalls: 0,
      modelExecutions: 0,
      fileAccess: 0,
      authEvents: 0,
      configChanges: 0,
      rotations: 0,
      errors: 0,
    };

    this.initializeLogDir();
    this.startFlushTimer();
  }

  /**
   * Initialize log directory
   * @private
   */
  initializeLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true, mode: 0o700 });
      }
    } catch (error) {
      console.error(
        "[AuditLogger] Failed to create log directory:",
        error.message,
      );
    }
  }

  /**
   * Log API call
   * @param {Object} details - API call details
   */
  logApiCall(details) {
    const {
      userId = "anonymous",
      method = "GET",
      endpoint = "/",
      status = 200,
      duration = 0,
      remoteIP = null,
      userAgent = null,
      error = null,
      requestId = null,
    } = details;

    this.writeLog({
      type: "API_CALL",
      timestamp: Date.now(),
      userId,
      method,
      endpoint,
      status,
      duration,
      remoteIP,
      userAgent,
      error,
      requestId,
    });

    this.stats.apiCalls++;
  }

  /**
   * Log model execution
   * @param {Object} details - Model execution details
   */
  logModelExecution(details) {
    const {
      userId = "system",
      model = "qwen",
      prompt = null,
      responseLength = 0,
      duration = 0,
      tokensUsed = 0,
      error = null,
      status = "success",
    } = details;

    this.writeLog({
      type: "MODEL_EXECUTION",
      timestamp: Date.now(),
      userId,
      model,
      promptLength: prompt ? prompt.length : 0,
      responseLength,
      duration,
      tokensUsed,
      error,
      status,
    });

    this.stats.modelExecutions++;
  }

  /**
   * Log file access
   * @param {Object} details - File access details
   */
  logFileAccess(details) {
    const {
      userId = "system",
      filePath = null,
      action = "read",
      status = "success",
      error = null,
      fileSize = 0,
      result = null,
    } = details;

    this.writeLog({
      type: "FILE_ACCESS",
      timestamp: Date.now(),
      userId,
      filePath,
      action,
      status,
      error,
      fileSize,
      result,
    });

    this.stats.fileAccess++;
  }

  /**
   * Log authentication event
   * @param {Object} details - Authentication details
   */
  logAuthEvent(details) {
    const {
      userId = null,
      username = null,
      action = "login",
      status = "success",
      remoteIP = null,
      error = null,
      tokenId = null,
    } = details;

    this.writeLog({
      type: "AUTH_EVENT",
      timestamp: Date.now(),
      userId,
      username,
      action,
      status,
      remoteIP,
      error,
      tokenId,
    });

    this.stats.authEvents++;
  }

  /**
   * Log configuration change
   * @param {Object} details - Configuration change details
   */
  logConfigChange(details) {
    const {
      userId = "system",
      configKey = null,
      oldValue = null,
      newValue = null,
      reason = null,
      status = "success",
      error = null,
    } = details;

    this.writeLog({
      type: "CONFIG_CHANGE",
      timestamp: Date.now(),
      userId,
      configKey,
      oldValue: JSON.stringify(oldValue),
      newValue: JSON.stringify(newValue),
      reason,
      status,
      error,
    });

    this.stats.configChanges++;
  }

  /**
   * Write log entry to buffer
   * @private
   */
  writeLog(entry) {
    const logLine = JSON.stringify(entry) + "\n";
    const bytes = Buffer.byteLength(logLine, "utf8");

    this.buffer.push(logLine);
    this.bufferBytes += bytes;
    this.stats.totalLogs++;

    if (this.bufferBytes >= this.bufferSize) {
      this.flush();
    }

    this.emit("log", entry);
  }

  /**
   * Flush buffer to disk
   */
  async flush() {
    if (this.buffer.length === 0) {
      return;
    }

    try {
      const filePath = this.getCurrentLogFile();
      const content = this.buffer.join("");

      fs.appendFileSync(filePath, content, { mode: 0o600 });

      this.buffer = [];
      this.bufferBytes = 0;

      this.emit("flush", { lines: this.stats.totalLogs, file: filePath });
    } catch (error) {
      console.error("[AuditLogger] Flush error:", error.message);
      this.stats.errors++;
    }
  }

  /**
   * Get current log file path
   * @private
   */
  getCurrentLogFile() {
    const date = new Date();
    const dateStr = date.toISOString().split("T")[0];
    const filename = `audit-${dateStr}.jsonl`;
    const filePath = path.join(this.logDir, filename);

    // Check for rotation
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size >= this.maxFileSize) {
        this.rotateLog(filePath);
        return this.getCurrentLogFile();
      }
    }

    return filePath;
  }

  /**
   * Rotate log file when it exceeds size limit
   * @private
   */
  rotateLog(filePath) {
    try {
      const timestamp = Date.now();
      const rotatedPath = filePath.replace(".jsonl", `.${timestamp}.jsonl`);
      fs.renameSync(filePath, rotatedPath);
      this.stats.rotations++;
      this.emit("rotate", { from: filePath, to: rotatedPath });
    } catch (error) {
      console.error("[AuditLogger] Rotation error:", error.message);
      this.stats.errors++;
    }
  }

  /**
   * Query logs with filters
   * @param {Object} filters - Query filters
   * @returns {Promise} Matching logs
   */
  async queryLogs(filters = {}) {
    const {
      action = null,
      userId = null,
      type = null,
      startTime = null,
      endTime = null,
      limit = 1000,
      offset = 0,
      status = null,
    } = filters;

    try {
      await this.flush();

      const logs = [];
      const files = fs
        .readdirSync(this.logDir)
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .reverse();

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const log = JSON.parse(line);

            if (this.matchesFilters(log, filters)) {
              logs.push(log);
              if (logs.length >= limit + offset) {
                break;
              }
            }
          } catch (parseError) {
            // Skip malformed lines
          }
        }

        if (logs.length >= limit + offset) {
          break;
        }
      }

      return {
        results: logs.slice(offset, offset + limit),
        total: logs.length,
        offset,
        limit,
        filters,
      };
    } catch (error) {
      console.error("[AuditLogger] Query error:", error.message);
      return { results: [], total: 0, error: error.message };
    }
  }

  /**
   * Check if log matches filter criteria
   * @private
   */
  matchesFilters(log, filters) {
    if (filters.type && log.type !== filters.type) return false;
    if (filters.userId && log.userId !== filters.userId) return false;
    if (filters.action && log.action !== filters.action) return false;
    if (filters.status && log.status !== filters.status) return false;
    if (filters.startTime && log.timestamp < filters.startTime) return false;
    if (filters.endTime && log.timestamp > filters.endTime) return false;
    return true;
  }

  /**
   * Start periodic flush timer
   * @private
   */
  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);

    this.flushTimer.unref();
  }

  /**
   * Cleanup old logs based on retention policy
   */
  async cleanup() {
    try {
      const now = Date.now();
      const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;

      const files = fs.readdirSync(this.logDir);
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }

      this.emit("cleanup", { deleted, retentionDays: this.retentionDays });
      return { success: true, deleted };
    } catch (error) {
      console.error("[AuditLogger] Cleanup error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get audit logger statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.bufferBytes,
      logDir: this.logDir,
      retentionDays: this.retentionDays,
    };
  }

  /**
   * Destroy logger
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

module.exports = { AuditLogger };
