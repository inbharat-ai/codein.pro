/**
 * Agent tasks and activity route handlers
 */
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  handleRoute,
} = require("../utils/http-helpers");

function registerAgentTaskRoutes(router, deps) {
  const {
    taskManager,
    permissionManager,
    readAgentActivity,
    appendAgentActivity: _appendAgentActivity,
    logger,
  } = deps;

  router.get("/agent/activity", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const limit = url.searchParams.get("limit") || "100";

        const validation = validateAndSanitizeInput(
          { limit: parseInt(limit, 10) || 100 },
          {
            limit: { required: false, type: "number", min: 1, max: 10000 },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const activity = readAgentActivity(validation.data.limit);
        jsonResponse(res, 200, { activity });
      },
      logger,
    );
  });

  router.post("/agent/tasks/start", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const raw = await readBody(req);
        const parsed = parseJsonBody(raw);
        if (!parsed.ok) {
          jsonResponse(res, 400, { error: parsed.error });
          return;
        }

        const validation = validateAndSanitizeInput(parsed.value, {
          title: {
            required: false,
            type: "string",
            maxLength: 500,
            sanitize: true,
          },
          steps: {
            required: true,
            type: "array",
            minLength: 1,
            maxLength: 1000,
          },
          workspacePath: { required: false, type: "string", format: "path" },
        });
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const { title, steps, workspacePath } = validation.data;

        if (!Array.isArray(steps) || steps.length === 0) {
          jsonResponse(res, 400, {
            error: "steps array is required and must not be empty",
          });
          return;
        }

        if (permissionManager) {
          for (const step of steps) {
            const toolName =
              step.type === "system-open"
                ? "systemOpen"
                : step.type === "run-command"
                  ? "runCommand"
                  : step.type === "write-file"
                    ? "writeFile"
                    : step.type === "read-file"
                      ? "readFile"
                      : step.type === "web-search" || step.type === "fetch-url"
                        ? "webFetch"
                        : null;

            if (!toolName) continue;

            const decision = await permissionManager.checkPermission(toolName, {
              workspacePath: workspacePath || process.cwd(),
              intent: "agent-task",
              details: { step },
            });
            if (!decision.allowed) {
              jsonResponse(res, 403, { error: "Permission denied", step });
              return;
            }
          }
        }

        const task = taskManager.createTask({
          title: title || "Untitled Task",
          steps,
        });
        jsonResponse(res, 200, { taskId: task.id, status: task.status });
      },
      logger,
    );
  });

  router.get("/agent/tasks/status", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const taskId = url.searchParams.get("taskId");

        const validation = validateAndSanitizeInput(
          { taskId },
          {
            taskId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const task = taskManager.getTask(validation.data.taskId);
        if (!task) {
          jsonResponse(res, 404, { error: "Task not found" });
          return;
        }
        jsonResponse(res, 200, { task });
      },
      logger,
    );
  });

  router.get("/agent/tasks/logs", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const taskId = url.searchParams.get("taskId");
        const tail = url.searchParams.get("tail") || "200";

        const validation = validateAndSanitizeInput(
          { taskId, tail: parseInt(tail, 10) || 200 },
          {
            taskId: {
              required: true,
              type: "string",
              minLength: 1,
              maxLength: 100,
              sanitize: true,
            },
            tail: { required: false, type: "number", min: 1, max: 10000 },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const task = taskManager.getTask(validation.data.taskId);
        if (!task) {
          jsonResponse(res, 404, { error: "Task not found" });
          return;
        }
        const logs = task.logs.slice(-validation.data.tail);
        jsonResponse(res, 200, { logs });
      },
      logger,
    );
  });

  router.get("/agent/tasks/list", async (req, res) => {
    await handleRoute(
      res,
      async () => {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "localhost"}`,
        );
        const limit = url.searchParams.get("limit") || "50";

        const validation = validateAndSanitizeInput(
          { limit: parseInt(limit, 10) || 50 },
          {
            limit: { required: false, type: "number", min: 1, max: 1000 },
          },
        );
        if (!validation.valid) {
          jsonResponse(res, 400, { error: validation.errors.join(", ") });
          return;
        }

        const tasks = taskManager.listTasks(validation.data.limit || 50);
        jsonResponse(res, 200, { tasks });
      },
      logger,
    );
  });
}

module.exports = { registerAgentTaskRoutes };
