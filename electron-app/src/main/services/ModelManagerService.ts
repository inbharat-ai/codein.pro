/**
 * Model Manager Service
 * Manages local LLM models and downloads
 */

import { app } from "electron";
import Store from "electron-store";
import * as fs from "fs/promises";
import * as http from "http";
import * as https from "https";
import * as path from "path";

interface ModelInfo {
  id: string;
  name: string;
  size: number;
  downloaded: boolean;
  path?: string;
  url?: string;
  description?: string;
}

interface DownloadProgress {
  modelId: string;
  downloaded: number;
  total: number;
  percentage: number;
  status: "downloading" | "complete" | "error";
}

export class ModelManagerService {
  private store: Store;
  private modelsDir: string;
  private activeDownloads: Map<string, boolean> = new Map();

  // Default models to bundle/download
  private readonly DEFAULT_MODELS: ModelInfo[] = [
    {
      id: "qwen2.5-coder-1.5b",
      name: "Qwen2.5-Coder 1.5B",
      size: 900 * 1024 * 1024, // ~900MB
      downloaded: false,
      url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
      description:
        "Fast and efficient code generation model, ideal for autocompletion",
    },
    {
      id: "deepseek-r1-7b",
      name: "DeepSeek-R1 7B",
      size: 4 * 1024 * 1024 * 1024, // ~4GB
      downloaded: false,
      url: "https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf",
      description: "Advanced reasoning model for complex code tasks",
    },
    {
      id: "starcoder2-7b",
      name: "StarCoder2 7B",
      size: 4 * 1024 * 1024 * 1024, // ~4GB
      downloaded: false,
      url: "https://huggingface.co/bartowski/starcoder2-7b-GGUF/resolve/main/starcoder2-7b-Q4_K_M.gguf",
      description:
        "Open coding model optimized for code completion and generation",
    },
    {
      id: "codellama-7b-instruct",
      name: "CodeLlama 7B Instruct",
      size: 4 * 1024 * 1024 * 1024, // ~4GB
      downloaded: false,
      url: "https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf",
      description: "Instruction-tuned coding model for local code assistance",
    },
  ];

  constructor() {
    this.store = new Store<Record<string, unknown>>({
      name: "models",
      defaults: {
        activeModel: null,
        models: {},
      },
    });

    this.modelsDir = path.join(app.getPath("userData"), "models");
  }

  /**
   * Initialize model manager
   */
  public async initialize(): Promise<void> {
    // Ensure models directory exists
    await fs.mkdir(this.modelsDir, { recursive: true });

    // Check which models are already downloaded
    await this.scanInstalledModels();
  }

  /**
   * Scan for installed models
   */
  private async scanInstalledModels(): Promise<void> {
    try {
      const files = await fs.readdir(this.modelsDir);
      const ggufFiles = files.filter((f) => f.endsWith(".gguf"));

      for (const model of this.DEFAULT_MODELS) {
        const expectedFilename = this.getModelFilename(model.id);
        const modelPath = path.join(this.modelsDir, expectedFilename);

        if (ggufFiles.includes(expectedFilename)) {
          const stats = await fs.stat(modelPath);
          model.downloaded = true;
          model.path = modelPath;
          model.size = stats.size;
        }
      }
    } catch (error) {
      console.error("Error scanning models:", error);
    }
  }

  /**
   * List all models
   */
  public async listModels(): Promise<ModelInfo[]> {
    await this.scanInstalledModels();
    return [...this.DEFAULT_MODELS];
  }

  /**
   * Download a model
   */
  public async downloadModel(
    modelId: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    const model = this.DEFAULT_MODELS.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (!model.url) {
      throw new Error(`No download URL for model ${modelId}`);
    }

    if (this.activeDownloads.get(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`);
    }

    this.activeDownloads.set(modelId, true);

    try {
      const filename = this.getModelFilename(modelId);
      const filepath = path.join(this.modelsDir, filename);

      await this.downloadFile(model.url, filepath, (downloaded, total) => {
        if (onProgress) {
          onProgress({
            modelId,
            downloaded,
            total,
            percentage: Math.round((downloaded / total) * 100),
            status: "downloading",
          });
        }
      });

      model.downloaded = true;
      model.path = filepath;

      if (onProgress) {
        onProgress({
          modelId,
          downloaded: model.size,
          total: model.size,
          percentage: 100,
          status: "complete",
        });
      }
    } catch (error) {
      if (onProgress) {
        onProgress({
          modelId,
          downloaded: 0,
          total: model.size,
          percentage: 0,
          status: "error",
        });
      }
      throw error;
    } finally {
      this.activeDownloads.delete(modelId);
    }
  }

  /**
   * Delete a model
   */
  public async deleteModel(modelId: string): Promise<void> {
    const model = this.DEFAULT_MODELS.find((m) => m.id === modelId);
    if (!model || !model.path) {
      throw new Error(`Model ${modelId} not found or not downloaded`);
    }

    await fs.unlink(model.path);
    model.downloaded = false;
    model.path = undefined;

    // If this was the active model, clear it
    const activeModel = this.getActiveModel();
    if (activeModel === modelId) {
      this.store.set("activeModel", null);
    }
  }

  /**
   * Get model info
   */
  public async getModelInfo(modelId: string): Promise<ModelInfo | null> {
    const model = this.DEFAULT_MODELS.find((m) => m.id === modelId);
    return model || null;
  }

  /**
   * Set active model
   */
  public async setActiveModel(modelId: string): Promise<void> {
    const model = this.DEFAULT_MODELS.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    if (!model.downloaded) {
      throw new Error(`Model ${modelId} is not downloaded`);
    }

    this.store.set("activeModel", modelId);
  }

  /**
   * Get active model
   */
  public getActiveModel(): string | null {
    return this.store.get("activeModel") as string | null;
  }

  /**
   * Get model path
   */
  public getModelPath(modelId: string): string | null {
    const model = this.DEFAULT_MODELS.find((m) => m.id === modelId);
    return model?.path || null;
  }

  /**
   * Download file with progress
   */
  private async downloadFile(
    url: string,
    destination: string,
    onProgress: (downloaded: number, total: number) => void,
    redirectDepth: number = 0,
  ): Promise<void> {
    if (redirectDepth > 5) {
      throw new Error("Too many redirects");
    }
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith("https") ? https : http;
      const file = require("fs").createWriteStream(destination);

      protocol
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirect
            file.close();
            if (response.headers.location) {
              this.downloadFile(
                response.headers.location,
                destination,
                onProgress,
                redirectDepth + 1,
              )
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error("Redirect without location"));
            }
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: ${response.statusCode}`));
            return;
          }

          const total = parseInt(response.headers["content-length"] || "0", 10);
          let downloaded = 0;

          response.on("data", (chunk) => {
            downloaded += chunk.length;
            onProgress(downloaded, total);
          });

          response.pipe(file);

          file.on("finish", () => {
            file.close();
            resolve();
          });

          file.on("error", (err: Error) => {
            fs.unlink(destination).catch(() => {});
            reject(err);
          });
        })
        .on("error", (err) => {
          fs.unlink(destination).catch(() => {});
          reject(err);
        });
    });
  }

  /**
   * Get model filename
   */
  private getModelFilename(modelId: string): string {
    return `${modelId}.gguf`;
  }
}
