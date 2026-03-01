/**
 * Local Model Runtime Manager
 * Handles llama.cpp runtime bootstrapping, model downloads, and inference
 */

const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const crypto = require("node:crypto");

const CODIN_DIR = path.join(os.homedir(), ".codin");
const RUNTIME_DIR = path.join(CODIN_DIR, "runtime");
const MODELS_DIR = path.join(CODIN_DIR, "models");
const MODELS_REGISTRY = path.join(CODIN_DIR, "models.json");

// llama.cpp release versions and checksums
const LLAMA_CPP_VERSION = "b3906";
const LLAMA_CPP_RELEASE_BASE = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_CPP_VERSION}`;
const RUNTIME_MANIFESTS = {
  win32: {
    url: `${LLAMA_CPP_RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-win-cuda-cu12.2.0-x64.zip`,
    executable: "llama-server.exe",
    checksumUrl: `${LLAMA_CPP_RELEASE_BASE}/sha256sum.txt`,
  },
  darwin: {
    url: `${LLAMA_CPP_RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-macos-arm64.zip`,
    executable: "llama-server",
    checksumUrl: `${LLAMA_CPP_RELEASE_BASE}/sha256sum.txt`,
  },
  linux: {
    url: `${LLAMA_CPP_RELEASE_BASE}/llama-${LLAMA_CPP_VERSION}-bin-ubuntu-x64.zip`,
    executable: "llama-server",
    checksumUrl: `${LLAMA_CPP_RELEASE_BASE}/sha256sum.txt`,
  },
};

// Default model catalog
const DEFAULT_MODELS = [
  {
    id: "qwen2.5-coder-7b-instruct-q4",
    name: "Qwen2.5 Coder 7B (Q4)",
    type: "coder",
    size: 4300000000, // ~4.3GB
    recommendedRAM: 8,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    filename: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
  },
  {
    id: "qwen2.5-coder-1.5b-instruct-q8",
    name: "Qwen2.5 Coder 1.5B (Q8)",
    type: "coder",
    size: 1600000000, // ~1.6GB
    recommendedRAM: 4,
    url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q8_0.gguf",
    filename: "qwen2.5-coder-1.5b-instruct-q8_0.gguf",
  },
  {
    id: "deepseek-r1-distill-qwen-7b-q4",
    name: "DeepSeek-R1 Distill Qwen 7B (Q4)",
    type: "reasoner",
    size: 4500000000, // ~4.5GB
    recommendedRAM: 8,
    url: "https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
    filename: "DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
  },
  {
    id: "starcoder2-7b-instruct-q4",
    name: "StarCoder2 7B Instruct (Q4)",
    type: "coder",
    size: 4200000000, // ~4.2GB
    recommendedRAM: 8,
    url: "https://huggingface.co/bartowski/starcoder2-7b-GGUF/resolve/main/starcoder2-7b-Q4_K_M.gguf",
    filename: "starcoder2-7b-Q4_K_M.gguf",
  },
  {
    id: "codellama-7b-instruct-q4",
    name: "CodeLlama 7B Instruct (Q4)",
    type: "coder",
    size: 3900000000, // ~3.9GB
    recommendedRAM: 8,
    url: "https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf",
    filename: "codellama-7b-instruct.Q4_K_M.gguf",
  },
];

function isTruthyEnv(value) {
  if (!value) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

class ModelRuntimeManager {
  constructor() {
    this.llamaProcess = null;
    this.currentModel = null;
    this.ensureDirectories();
  }

  ensureDirectories() {
    [CODIN_DIR, RUNTIME_DIR, MODELS_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Bootstrap llama.cpp runtime
   */
  async bootstrapRuntime() {
    const platform = os.platform();
    const manifest = RUNTIME_MANIFESTS[platform];

    if (!manifest) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const configuredRuntimePath = process.env.LLAMA_PATH;
    if (configuredRuntimePath) {
      if (!fs.existsSync(configuredRuntimePath)) {
        throw new Error(
          `LLAMA_PATH is set but executable was not found: ${configuredRuntimePath}`,
        );
      }
      console.log(
        `[ModelRuntime] Using configured runtime: ${configuredRuntimePath}`,
      );
      return configuredRuntimePath;
    }

    const executablePath = path.join(RUNTIME_DIR, manifest.executable);

    // Check if already installed
    if (fs.existsSync(executablePath)) {
      console.log("[ModelRuntime] llama.cpp already installed");
      return executablePath;
    }

    const pathRuntime = this.findLlamaServerInPath();
    if (pathRuntime) {
      console.log(
        `[ModelRuntime] Using llama-server from PATH: ${pathRuntime}`,
      );
      return pathRuntime;
    }

    if (isTruthyEnv(process.env.DISABLE_LLAMA_AUTO_PROVISION)) {
      throw new Error(
        "llama.cpp runtime not found locally and DISABLE_LLAMA_AUTO_PROVISION is enabled",
      );
    }

    console.log("[ModelRuntime] Downloading llama.cpp runtime...");

    const archiveName = path.basename(new URL(manifest.url).pathname);
    const archivePath = path.join(RUNTIME_DIR, archiveName);

    try {
      await this.downloadFile(manifest.url, archivePath, (progress) => {
        if (progress.percent) {
          console.log(
            `[ModelRuntime] Download ${progress.percent.toFixed(1)}%`,
          );
        }
      });

      const expectedChecksum = await this.fetchChecksum(
        manifest.checksumUrl,
        archiveName,
      );
      await this.verifyChecksum(archivePath, expectedChecksum);

      await this.extractArchive(archivePath, RUNTIME_DIR);

      if (!fs.existsSync(executablePath)) {
        throw new Error(
          "llama.cpp extraction completed but executable not found",
        );
      }

      if (platform !== "win32") {
        fs.chmodSync(executablePath, 0o755);
      }

      fs.unlinkSync(archivePath);
      console.log("[ModelRuntime] llama.cpp installed");
      return executablePath;
    } catch (error) {
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
      }

      const llamaServerPath = this.findLlamaServerInPath();
      if (llamaServerPath) {
        console.warn(
          `[ModelRuntime] Runtime download failed, using llama-server from PATH: ${llamaServerPath}`,
        );
        return llamaServerPath;
      }

      throw error;
    }
  }

  async fetchChecksum(checksumUrl, archiveName) {
    const contents = await this.downloadText(checksumUrl);
    const escapedName = archiveName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^([a-fA-F0-9]{64})\\s+\\*?${escapedName}$`, "m");
    const match = contents.match(regex);

    if (!match) {
      throw new Error(`Checksum not found for ${archiveName}`);
    }

    return match[1].toLowerCase();
  }

  async verifyChecksum(filePath, expectedChecksum) {
    const actual = await this.computeSha256(filePath);
    if (actual !== expectedChecksum) {
      throw new Error(
        `Checksum mismatch: expected ${expectedChecksum}, got ${actual}`,
      );
    }
  }

  async computeSha256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  async downloadText(url) {
    return new Promise((resolve, reject) => {
      https
        .get(url, (response) => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(
              new Error(`Failed to download checksum: ${response.statusCode}`),
            );
            return;
          }
          let data = "";
          response.on("data", (chunk) => {
            data += chunk.toString();
          });
          response.on("end", () => resolve(data));
        })
        .on("error", reject);
    });
  }

  async extractArchive(archivePath, destinationDir) {
    const platform = os.platform();
    if (platform === "win32") {
      const escapedArchive = archivePath.replace(/'/g, "''");
      const escapedDest = destinationDir.replace(/'/g, "''");
      const command = `Expand-Archive -Path '${escapedArchive}' -DestinationPath '${escapedDest}' -Force`;
      await this.runCommand("powershell", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        command,
      ]);
      return;
    }

    await this.runCommand("unzip", ["-o", archivePath, "-d", destinationDir]);
  }

  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("error", (error) => {
        if (error.code === "ENOENT") {
          reject(new Error(`Required command not found: ${command}`));
        } else {
          reject(error);
        }
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${command} failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  findLlamaServerInPath() {
    const PATH = process.env.PATH || "";
    const paths = PATH.split(path.delimiter);
    const executable =
      os.platform() === "win32" ? "llama-server.exe" : "llama-server";

    for (const dir of paths) {
      const fullPath = path.join(dir, executable);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    return null;
  }

  /**
   * Load models registry
   */
  loadModelsRegistry() {
    if (!fs.existsSync(MODELS_REGISTRY)) {
      const defaultRegistry = {
        installedModels: [],
        defaultCoder: null,
        defaultReasoner: null,
        catalog: DEFAULT_MODELS,
      };
      fs.writeFileSync(
        MODELS_REGISTRY,
        JSON.stringify(defaultRegistry, null, 2),
      );
      return defaultRegistry;
    }
    return JSON.parse(fs.readFileSync(MODELS_REGISTRY, "utf8"));
  }

  /**
   * Save models registry
   */
  saveModelsRegistry(registry) {
    fs.writeFileSync(MODELS_REGISTRY, JSON.stringify(registry, null, 2));
  }

  /**
   * List all models
   */
  listModels() {
    const registry = this.loadModelsRegistry();
    return {
      installed: registry.installedModels,
      available: registry.catalog,
      defaults: {
        coder: registry.defaultCoder,
        reasoner: registry.defaultReasoner,
      },
    };
  }

  /**
   * Download a model with progress
   */
  async downloadModel(modelId, onProgress) {
    const registry = this.loadModelsRegistry();
    const modelSpec = registry.catalog.find((m) => m.id === modelId);

    if (!modelSpec) {
      throw new Error(`Model not found: ${modelId}`);
    }

    // Check if already installed
    const existing = registry.installedModels.find((m) => m.id === modelId);
    if (existing && fs.existsSync(existing.path)) {
      return {
        success: true,
        message: "Model already installed",
        path: existing.path,
      };
    }

    const outputPath = path.join(MODELS_DIR, modelSpec.filename);

    console.log(`[ModelRuntime] Downloading ${modelSpec.name}...`);

    await this.downloadFile(modelSpec.url, outputPath, (progress) => {
      if (onProgress) {
        onProgress({
          modelId,
          downloaded: progress.downloaded,
          total: progress.total,
          percent: progress.percent,
        });
      }
    });

    // Verify download
    const stats = fs.statSync(outputPath);
    if (stats.size < 1000000) {
      // Less than 1MB is suspicious
      fs.unlinkSync(outputPath);
      throw new Error("Download failed: file too small");
    }

    // Add to registry
    const installedModel = {
      id: modelSpec.id,
      name: modelSpec.name,
      type: modelSpec.type,
      size: stats.size,
      path: outputPath,
      recommendedRAM: modelSpec.recommendedRAM,
      installedAt: new Date().toISOString(),
    };

    registry.installedModels.push(installedModel);

    // Set as default if first of its type
    if (modelSpec.type === "coder" && !registry.defaultCoder) {
      registry.defaultCoder = modelSpec.id;
    } else if (modelSpec.type === "reasoner" && !registry.defaultReasoner) {
      registry.defaultReasoner = modelSpec.id;
    }

    this.saveModelsRegistry(registry);

    return { success: true, path: outputPath, model: installedModel };
  }

  /**
   * Download file with progress
   */
  downloadFile(url, outputPath, onProgress) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(outputPath);
      let downloaded = 0;

      https
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Follow redirect
            return https.get(response.headers.location, handleResponse);
          }
          return handleResponse(response);
        })
        .on("error", (err) => {
          fs.unlinkSync(outputPath);
          reject(err);
        });

      function handleResponse(response) {
        const total = parseInt(response.headers["content-length"], 10);

        response.on("data", (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (onProgress) {
            onProgress({
              downloaded,
              total,
              percent: total ? (downloaded / total) * 100 : 0,
            });
          }
        });

        response.on("end", () => {
          file.end();
          resolve();
        });

        response.on("error", (err) => {
          fs.unlinkSync(outputPath);
          reject(err);
        });
      }
    });
  }

  /**
   * Import local GGUF file
   */
  importLocalModel(filePath, name, type = "coder") {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found");
    }

    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const targetPath = path.join(MODELS_DIR, filename);

    // Copy if not already in models dir
    if (path.dirname(filePath) !== MODELS_DIR) {
      fs.copyFileSync(filePath, targetPath);
    }

    const registry = this.loadModelsRegistry();

    const installedModel = {
      id: `local-${Date.now()}`,
      name: name || filename,
      type,
      size: stats.size,
      path: targetPath,
      recommendedRAM: Math.ceil(stats.size / 1e9) * 1.5, // Rough estimate
      installedAt: new Date().toISOString(),
      imported: true,
    };

    registry.installedModels.push(installedModel);
    this.saveModelsRegistry(registry);

    return installedModel;
  }

  /**
   * Set default model
   */
  setDefaultModel(modelId, type) {
    const registry = this.loadModelsRegistry();
    const model = registry.installedModels.find((m) => m.id === modelId);

    if (!model) {
      throw new Error("Model not found");
    }

    if (type === "coder") {
      registry.defaultCoder = modelId;
    } else if (type === "reasoner") {
      registry.defaultReasoner = modelId;
    }

    this.saveModelsRegistry(registry);
    return { success: true };
  }

  /**
   * Delete model
   */
  deleteModel(modelId) {
    const registry = this.loadModelsRegistry();
    const model = registry.installedModels.find((m) => m.id === modelId);

    if (!model) {
      throw new Error("Model not found");
    }

    // Delete file
    if (fs.existsSync(model.path)) {
      fs.unlinkSync(model.path);
    }

    // Remove from registry
    registry.installedModels = registry.installedModels.filter(
      (m) => m.id !== modelId,
    );

    // Clear defaults if needed
    if (registry.defaultCoder === modelId) {
      registry.defaultCoder = null;
    }
    if (registry.defaultReasoner === modelId) {
      registry.defaultReasoner = null;
    }

    this.saveModelsRegistry(registry);
    return { success: true };
  }

  /**
   * Check system resources
   */
  checkSystemResources() {
    const totalRAM = os.totalmem() / 1e9; // GB
    const freeRAM = os.freemem() / 1e9; // GB
    const cpuCount = os.cpus().length;

    return {
      totalRAM: Math.round(totalRAM),
      freeRAM: Math.round(freeRAM),
      cpuCount,
      platform: os.platform(),
      arch: os.arch(),
    };
  }

  /**
   * Start llama.cpp server with model
   */
  async startInference(modelId, options = {}) {
    const registry = this.loadModelsRegistry();
    const model = registry.installedModels.find((m) => m.id === modelId);

    if (!model) {
      throw new Error("Model not found");
    }

    // Check resources
    const resources = this.checkSystemResources();
    if (resources.freeRAM < model.recommendedRAM) {
      console.warn(
        `[ModelRuntime] Low RAM: ${resources.freeRAM}GB free, ${model.recommendedRAM}GB recommended`,
      );
    }

    // Stop any running inference
    if (this.llamaProcess) {
      await this.stopInference();
    }

    const executablePath = await this.bootstrapRuntime();

    const port = options.port || 8080;
    const contextSize = options.contextSize || 8192;

    const args = [
      "-m",
      model.path,
      "--host",
      "127.0.0.1",
      "--port",
      port.toString(),
      "--ctx-size",
      contextSize.toString(),
      "--n-gpu-layers",
      "0", // CPU only for now
    ];

    console.log(`[ModelRuntime] Starting inference with ${model.name}...`);

    this.llamaProcess = spawn(executablePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.currentModel = model;

    // Wait for server to be ready
    await this.waitForServer(port);

    return {
      success: true,
      model: model.name,
      port,
      endpoint: `http://localhost:${port}`,
    };
  }

  /**
   * Wait for llama.cpp server to be ready
   */
  async waitForServer(port, maxAttempts = 30) {
    const http = require("node:http");

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.request(`http://localhost:${port}/health`, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              reject(new Error(`Status ${res.statusCode}`));
            }
          });
          req.on("error", reject);
          req.end();
        });

        console.log("[ModelRuntime] Server ready");
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error("Server failed to start");
  }

  /**
   * Stop inference
   */
  async stopInference() {
    if (this.llamaProcess) {
      this.llamaProcess.kill();
      this.llamaProcess = null;
      this.currentModel = null;
      console.log("[ModelRuntime] Inference stopped");
    }
  }

  /**
   * Get inference status
   */
  getStatus() {
    return {
      running: !!this.llamaProcess,
      model: this.currentModel,
      resources: this.checkSystemResources(),
    };
  }
}

const modelRuntime = new ModelRuntimeManager();

module.exports = { modelRuntime };
