const { EventEmitter } = require("node:events");

class TaskManager extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.handlers = {};
  }

  setHandlers(handlers) {
    this.handlers = handlers || {};
  }

  createTask(task) {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const record = {
      id,
      title: task.title || "Untitled Task",
      status: "queued",
      steps: task.steps || [],
      logs: [],
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, record);
    this.emit("task-created", record);
    this.runTask(id).catch((error) => {
      this.failTask(id, error);
    });

    return record;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  listTasks(limit = 50) {
    return Array.from(this.tasks.values()).slice(-limit).reverse();
  }

  appendLog(taskId, entry) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.logs.push(entry);
    task.updatedAt = new Date().toISOString();
    this.emit("task-log", { taskId, entry });
  }

  async runTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "running";
    task.updatedAt = new Date().toISOString();
    this.emit("task-started", task);

    for (const [index, step] of task.steps.entries()) {
      const handler = this.handlers[step.type];
      const stepInfo = {
        index,
        type: step.type,
        status: "running",
        startedAt: new Date().toISOString(),
      };
      this.appendLog(taskId, {
        level: "info",
        message: `Step ${index + 1}: ${step.type}`,
        step: stepInfo,
      });

      if (!handler) {
        throw new Error(`No handler for step type: ${step.type}`);
      }

      try {
        const result = await handler(step, task);
        stepInfo.status = "completed";
        stepInfo.completedAt = new Date().toISOString();
        this.appendLog(taskId, {
          level: "info",
          message: `Step ${index + 1} completed`,
          step: stepInfo,
          result,
        });
      } catch (error) {
        stepInfo.status = "failed";
        stepInfo.completedAt = new Date().toISOString();
        this.appendLog(taskId, {
          level: "error",
          message: `Step ${index + 1} failed`,
          step: stepInfo,
          error: error.message || String(error),
        });
        throw error;
      }
    }

    task.status = "completed";
    task.updatedAt = new Date().toISOString();
    this.emit("task-completed", task);
  }

  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "failed";
    task.updatedAt = new Date().toISOString();
    this.appendLog(taskId, {
      level: "error",
      message: error.message || String(error),
    });
    this.emit("task-failed", { task, error });
  }
}

module.exports = { TaskManager };
