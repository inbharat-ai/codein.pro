/**
 * Task manager handler & event configuration.
 * Extracted from index.js.
 */
"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

/**
 * Open a URL in the system browser. Only http/https URLs are allowed.
 * @param {string} target
 */
function openSystemTarget(target) {
  if (!target) {
    throw new Error("Target is required");
  }

  // SECURITY: Only allow http/https URLs — no arbitrary file paths via shell
  let sanitized;
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Disallowed protocol: ${parsed.protocol}`);
    }
    // Prevent URL-encoded shell metacharacters
    sanitized = parsed.href;
  } catch (urlErr) {
    // Not a valid URL — reject. Only URLs are allowed for safety.
    throw new Error(
      "Invalid target: only http/https URLs are allowed for system-open",
    );
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", sanitized], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return;
  }

  if (process.platform === "darwin") {
    spawn("open", [sanitized], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [sanitized], { detached: true, stdio: "ignore" }).unref();
}

/**
 * Configure the task manager with step handlers and event subscriptions.
 * @param {object} taskManager - TaskManager instance
 * @param {object} deps
 * @param {object} deps.sanitizer - Sanitizer instance
 * @param {object} deps.validator - Validator instance
 * @param {Function} deps.validateAndSanitizeInput
 * @param {object} deps.webResearchService
 * @param {object} deps.processManager - may be null
 * @param {Function} deps.appendAgentActivity
 */
function configureTaskManager(taskManager, deps) {
  const {
    sanitizer,
    validator,
    validateAndSanitizeInput,
    webResearchService,
    processManager,
    appendAgentActivity,
  } = deps;

  taskManager.setHandlers({
    "web-search": async (step) => {
      // Sanitize query
      const sanitized = sanitizer.sanitizePrompt(step.query || "", {
        mode: "moderate",
      });
      return await webResearchService.searchWeb(
        sanitized.sanitized,
        step.limit || 5,
      );
    },
    "fetch-url": async (step) => {
      // Validate URL
      const urlValidation = validateAndSanitizeInput(
        { url: step.url },
        {
          url: {
            required: true,
            type: "string",
            format: "url",
            allowedProtocols: ["http", "https"],
          },
        },
      );
      if (!urlValidation.valid) {
        throw new Error(`Invalid URL: ${urlValidation.errors.join(", ")}`);
      }
      return await webResearchService.fetchUrl(urlValidation.data.url);
    },
    "run-command": async (step) => {
      // Validate command
      const cmdValidation = validator.isValidCommand(step.command, {
        allowChaining: false,
        strict: true,
      });
      if (!cmdValidation.valid) {
        throw new Error(`Invalid command: ${cmdValidation.errors.join(", ")}`);
      }

      const profile = {
        runCmd: step.command,
        cwd: step.cwd || process.cwd(),
        env: step.env || {},
        port: step.port,
      };
      const result = await processManager.start(profile, {
        approved: !!step.approved,
      });
      return result;
    },
    "read-file": async (step) => {
      // Validate file path
      const pathValidation = validator.isValidFilePath(step.path, {
        mustExist: true,
        checkReadable: true,
      });
      if (!pathValidation.valid) {
        throw new Error(
          `Invalid file path: ${pathValidation.errors.join(", ")}`,
        );
      }
      const content = fs.readFileSync(pathValidation.path, "utf8");
      return { path: pathValidation.path, content };
    },
    "write-file": async (step) => {
      // Validate file path
      const pathValidation = validator.isValidFilePath(step.path, {
        mustExist: false,
        checkReadable: false,
      });
      if (!pathValidation.valid) {
        throw new Error(
          `Invalid file path: ${pathValidation.errors.join(", ")}`,
        );
      }
      // Sanitize content if it's a string
      let content = step.content || "";
      if (typeof content === "string") {
        const sanitized = sanitizer.sanitizePrompt(content, {
          mode: "moderate",
        });
        content = sanitized.sanitized;
      }
      fs.writeFileSync(pathValidation.path, content, "utf8");
      return { path: step.path, bytes: (step.content || "").length };
    },
    "system-open": async (step) => {
      openSystemTarget(step.target);
      return { target: step.target };
    },
  });

  taskManager.on("task-created", (task) => {
    appendAgentActivity({
      type: "task",
      action: "created",
      taskId: task.id,
      title: task.title,
    });
  });

  taskManager.on("task-started", (task) => {
    appendAgentActivity({
      type: "task",
      action: "started",
      taskId: task.id,
    });
  });

  taskManager.on("task-log", ({ taskId, entry }) => {
    appendAgentActivity({
      type: "task-log",
      taskId,
      level: entry.level,
      message: entry.message,
    });
  });

  taskManager.on("task-completed", (task) => {
    appendAgentActivity({
      type: "task",
      action: "completed",
      taskId: task.id,
    });
  });

  taskManager.on("task-failed", ({ task, error }) => {
    appendAgentActivity({
      type: "task",
      action: "failed",
      taskId: task.id,
      error: error.message || String(error),
    });
  });
}

module.exports = { configureTaskManager, openSystemTarget };
