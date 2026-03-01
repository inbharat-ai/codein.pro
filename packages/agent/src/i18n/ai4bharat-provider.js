/**
 * AI4Bharat Indic Provider
 * Integrates with local Python microservice for Indic language support
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// __filename and __dirname are natively available in CJS

const INDIC_SERVER_PORT = 43121;
const INDIC_SERVER_URL = `http://127.0.0.1:${INDIC_SERVER_PORT}`;

async function getFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

class AI4BharatProvider {
  constructor() {
    this.name = "AI4Bharat";
    this.serverProcess = null;
    this.serverReady = false;
  }

  /**
   * Start Indic server
   */
  async startServer() {
    if (this.serverProcess) {
      console.log("[AI4Bharat] Server already running");
      return;
    }

    const serverDir = path.join(__dirname, "indic_server");
    const serverScript = path.join(serverDir, "server.py");
    const setupScript = path.join(serverDir, "setup.py");

    // Check if server files exist
    if (!fs.existsSync(serverScript)) {
      console.warn("[AI4Bharat] Server files not found");
      return;
    }

    // Check if venv exists, if not run setup
    const venvDir = path.join(serverDir, "venv");
    if (!fs.existsSync(venvDir)) {
      console.log("[AI4Bharat] Running first-time setup...");
      await this.runSetup(setupScript);
    }

    // Determine python executable
    const pythonExec =
      process.platform === "win32"
        ? path.join(venvDir, "Scripts", "python.exe")
        : path.join(venvDir, "bin", "python");

    if (!fs.existsSync(pythonExec)) {
      console.warn("[AI4Bharat] Python executable not found");
      return;
    }

    console.log("[AI4Bharat] Starting Indic server...");

    this.serverProcess = spawn(pythonExec, [serverScript], {
      cwd: serverDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.serverProcess.stdout.on("data", (data) => {
      console.log(`[AI4Bharat] ${data.toString().trim()}`);
    });

    this.serverProcess.stderr.on("data", (data) => {
      console.error(`[AI4Bharat] ${data.toString().trim()}`);
    });

    this.serverProcess.on("close", (code) => {
      console.log(`[AI4Bharat] Server exited with code ${code}`);
      this.serverProcess = null;
      this.serverReady = false;
    });

    // Wait for server to be ready
    await this.waitForServer();
  }

  /**
   * Run setup script
   */
  async runSetup(setupScript) {
    return new Promise((resolve, reject) => {
      const process = spawn("python", [setupScript], {
        cwd: path.dirname(setupScript),
        stdio: "inherit",
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Setup failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Wait for server to be ready
   */
  async waitForServer(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const doFetch = await getFetch();
        const response = await doFetch(`${INDIC_SERVER_URL}/health`);
        if (response.ok) {
          this.serverReady = true;
          console.log("[AI4Bharat] Server ready");
          return;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("Indic server failed to start");
  }

  /**
   * Stop server
   */
  stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
      this.serverReady = false;
      console.log("[AI4Bharat] Server stopped");
    }
  }

  /**
   * Translate text
   */
  async translate(text, sourceLang, targetLang) {
    if (!this.serverReady) {
      await this.startServer();
    }

    const doFetch = await getFetch();
    const response = await doFetch(`${INDIC_SERVER_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLang,
        targetLang,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.translated;
  }

  /**
   * Transcribe audio
   */
  async transcribe(audioPath, lang) {
    if (!this.serverReady) {
      await this.startServer();
    }

    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("audio", fs.createReadStream(audioPath));
    formData.append("lang", lang);

    const doFetch = await getFetch();
    const response = await doFetch(`${INDIC_SERVER_URL}/stt`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.transcript;
  }

  /**
   * Synthesize speech
   */
  async synthesize(text, lang, outputPath) {
    if (!this.serverReady) {
      await this.startServer();
    }

    const doFetch = await getFetch();
    const response = await doFetch(`${INDIC_SERVER_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        lang,
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.audioPath) {
      // Copy audio file to output path
      fs.copyFileSync(data.audioPath, outputPath);
      return outputPath;
    }

    throw new Error("TTS not available");
  }
}

const ai4bharatProvider = new AI4BharatProvider();

module.exports = { ai4bharatProvider };
