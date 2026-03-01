/**
 * Model management route handlers — list, download, import, activate
 */
const path = require("node:path");
const {
  jsonResponse,
  readBody,
  parseJsonBody,
  validateAndSanitizeInput,
  safeFilename,
  handleRoute,
} = require("../utils/http-helpers");

function registerModelRoutes(router, deps) {
  const {
    loadStore,
    saveStore,
    getAgentPaths,
    ensureDirs,
    downloadFile,
    requirePermission,
    auditedAction,
    permissionManager,
    logger,
  } = deps;

  router.get("/models", async (req, res) => {
    const store = loadStore();
    jsonResponse(res, 200, store);
  });

  router.post("/models/download", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      id: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 100,
        sanitize: true,
      },
      name: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 200,
        sanitize: true,
      },
      url: {
        required: true,
        type: "string",
        format: "url",
        allowedProtocols: ["http", "https"],
      },
      role: { required: false, type: "string", maxLength: 50 },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    const { id, name, url: modelUrl, role } = validation.data;

    const permission = await requirePermission(
      "downloadModel",
      { workspacePath: process.cwd(), modelUrl, modelName: name },
      permissionManager,
    );
    if (!permission.allowed) {
      jsonResponse(res, 403, {
        error: "Permission denied: " + (permission.reason || "Unauthorized"),
      });
      return;
    }

    await auditedAction(
      "model-download",
      { id, name, url: modelUrl },
      async () => {
        const { modelsDir } = getAgentPaths();
        ensureDirs();
        const safeName = safeFilename(name);
        const filePath = path.join(modelsDir, safeName);
        await downloadFile(modelUrl, filePath);

        const store = loadStore();
        const existing = store.models.find((m) => m.id === id);
        if (existing) {
          existing.path = filePath;
          existing.name = name;
          existing.role = role || existing.role;
        } else {
          store.models.push({
            id,
            name,
            path: filePath,
            role: role || "coder",
          });
        }
        saveStore(store);
      },
    );

    jsonResponse(res, 200, {
      status: "ok",
      model: {
        id,
        name,
        path: path.join(getAgentPaths().modelsDir, safeFilename(name)),
      },
    });
  });

  router.post("/models/import", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      id: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 100,
        sanitize: true,
      },
      name: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 200,
        sanitize: true,
      },
      filePath: {
        required: true,
        type: "string",
        format: "path",
        mustExist: true,
      },
      role: {
        required: false,
        type: "string",
        minLength: 1,
        maxLength: 50,
        sanitize: true,
      },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    const { id, name, filePath, role } = validation.data;
    const store = loadStore();
    const existing = store.models.find((m) => m.id === id);
    if (existing) {
      existing.path = filePath;
      existing.name = name;
      existing.role = role || existing.role;
    } else {
      store.models.push({ id, name, path: filePath, role: role || "coder" });
    }
    saveStore(store);
    jsonResponse(res, 200, {
      status: "ok",
      model: { id, name, path: filePath },
    });
  });

  router.post("/models/activate", async (req, res) => {
    const raw = await readBody(req);
    const parsed = parseJsonBody(raw);
    if (!parsed.ok) {
      jsonResponse(res, 400, { error: parsed.error });
      return;
    }

    const validation = validateAndSanitizeInput(parsed.value, {
      id: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 100,
        sanitize: true,
      },
      role: {
        required: true,
        type: "string",
        minLength: 1,
        maxLength: 50,
        sanitize: true,
      },
    });
    if (!validation.valid) {
      jsonResponse(res, 400, { error: validation.errors.join(", ") });
      return;
    }

    const { id, role } = validation.data;
    const store = loadStore();
    if (!store.models.find((m) => m.id === id)) {
      jsonResponse(res, 404, { error: "model not found" });
      return;
    }
    store.active[role] = id;
    saveStore(store);
    jsonResponse(res, 200, { status: "ok", active: store.active });
  });
}

module.exports = { registerModelRoutes };
