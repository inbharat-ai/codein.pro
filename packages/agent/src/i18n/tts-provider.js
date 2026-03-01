/**
 * @fileoverview Text-to-Speech (TTS) Provider
 * Real voice output for Indian languages via gTTS / Piper / espeak with graceful fallback.
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const crypto = require("crypto");

const GTTS_LANG_MAP = {
  hi: "hi",
  bn: "bn",
  ta: "ta",
  te: "te",
  kn: "kn",
  ml: "ml",
  mr: "mr",
  gu: "gu",
  pa: "pa",
  ur: "ur",
  en: "en",
  or: "or",
  as: "as",
};

const ESPEAK_LANG_MAP = {
  hi: "hi",
  bn: "bn",
  ta: "ta",
  te: "te",
  kn: "kn",
  ml: "ml",
  mr: "mr",
  gu: "gu",
  pa: "pa",
  ur: "ur",
  en: "en",
};

const PIPER_MODEL_MAP = {
  hi: "hi_IN-microsoft-low",
  en: "en_US-lessac-low",
};

/**
 * Detect which TTS engines are available
 * @returns {{ gtts: boolean, piper: boolean, espeak: boolean }}
 */
function detectTTSEngines() {
  const engines = { gtts: false, piper: false, espeak: false };

  // Check gTTS (Python)
  try {
    execSync("gtts-cli --help", { stdio: "ignore", timeout: 5000 });
    engines.gtts = true;
  } catch {
    try {
      execSync('python -c "from gtts import gTTS"', {
        stdio: "ignore",
        timeout: 10000,
      });
      engines.gtts = true;
    } catch {
      try {
        execSync('python3 -c "from gtts import gTTS"', {
          stdio: "ignore",
          timeout: 10000,
        });
        engines.gtts = true;
      } catch {
        /* not found */
      }
    }
  }

  // Check Piper
  try {
    execSync("piper --help", { stdio: "ignore", timeout: 5000 });
    engines.piper = true;
  } catch {
    /* not found */
  }

  // Check espeak / espeak-ng
  try {
    execSync("espeak-ng --version", { stdio: "ignore", timeout: 5000 });
    engines.espeak = true;
  } catch {
    try {
      execSync("espeak --version", { stdio: "ignore", timeout: 5000 });
      engines.espeak = true;
    } catch {
      /* not found */
    }
  }

  return engines;
}

/**
 * @class TTSProvider
 * @description Text-to-Speech provider with real engine integration and auto-detection
 */
class TTSProvider {
  constructor(options = {}) {
    this.preferredEngine = options.engine || "auto";
    this.detectedEngines = null; // lazily detected
    this.supportedLanguages = [
      "hi",
      "bn",
      "ta",
      "te",
      "kn",
      "ml",
      "mr",
      "gu",
      "pa",
      "or",
      "as",
      "ur",
      "en",
    ];
    this.outputDir =
      options.outputDir || path.join(process.cwd(), "output", "audio");
    this.pythonCmd =
      options.pythonCmd ||
      (process.platform === "win32" ? "python" : "python3");
    this.ensureOutputDir();
  }

  ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get detected engines (lazy)
   * @returns {{ gtts: boolean, piper: boolean, espeak: boolean }}
   */
  _getEngines() {
    if (!this.detectedEngines) {
      this.detectedEngines = detectTTSEngines();
    }
    return this.detectedEngines;
  }

  /**
   * Determine the best engine for a given language
   * @param {string} language
   * @returns {"gtts"|"piper"|"espeak"|"none"}
   */
  _selectEngine(language) {
    if (this.preferredEngine !== "auto") {
      return this.preferredEngine;
    }
    const engines = this._getEngines();

    // Prefer gTTS for broadest Indian language support + high quality
    if (engines.gtts && GTTS_LANG_MAP[language]) return "gtts";
    // Piper for supported languages (fast, offline)
    if (engines.piper && PIPER_MODEL_MAP[language]) return "piper";
    // espeak as last resort
    if (engines.espeak && ESPEAK_LANG_MAP[language]) return "espeak";

    return "none";
  }

  isLanguageSupported(langCode) {
    return this.supportedLanguages.includes(langCode);
  }

  /**
   * Convert text to speech with real engine
   * @param {string} text
   * @param {string} language
   * @param {string} [outputPath]
   * @returns {Promise<Object>}
   */
  async synthesize(text, language = "en", outputPath = null) {
    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }
    if (!this.isLanguageSupported(language)) {
      throw new Error(`Language not supported: ${language}`);
    }

    if (!outputPath) {
      const hash = crypto
        .createHash("md5")
        .update(text + language)
        .digest("hex")
        .substring(0, 8);
      outputPath = path.join(this.outputDir, `tts_${language}_${hash}.mp3`);
    }

    // Return cached audio if already synthesized
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      if (stats.size > 0) {
        return {
          success: true,
          audioPath: outputPath,
          language,
          duration: text.length / 10,
          text,
          fileSize: stats.size,
          engine: "cache",
          exists: true,
          cached: true,
        };
      }
    }

    const engine = this._selectEngine(language);

    const engineHandlers = {
      gtts: () => this.synthesizeWithGTTS(text, language, outputPath),
      piper: () => this.synthesizeWithPiper(text, language, outputPath),
      espeak: () => this.synthesizeWithEspeak(text, language, outputPath),
    };

    if (engine !== "none" && engineHandlers[engine]) {
      try {
        return await engineHandlers[engine]();
      } catch (err) {
        console.warn(`[TTS] ${engine} failed: ${err.message}`);
        // Try fallback engines in order
        for (const fallback of ["gtts", "espeak"]) {
          if (fallback !== engine && engineHandlers[fallback]) {
            try {
              return await engineHandlers[fallback]();
            } catch {
              /* continue to next */
            }
          }
        }
      }
    }

    // No engine available
    return {
      success: false,
      audioPath: outputPath,
      language,
      text,
      engine: "none",
      exists: false,
      error: "No TTS engine available. Install gTTS: pip install gTTS",
      installGuide: {
        gtts: "pip install gTTS",
        espeak:
          "apt install espeak-ng (Linux) or choco install espeak (Windows)",
        piper: "https://github.com/rhasspy/piper/releases",
      },
    };
  }

  /**
   * Synthesize with gTTS (Google Text-to-Speech via Python)
   * @param {string} text
   * @param {string} language
   * @param {string} outputPath
   * @returns {Promise<Object>}
   */
  async synthesizeWithGTTS(text, language, outputPath) {
    return new Promise((resolve, reject) => {
      const gttsLang = GTTS_LANG_MAP[language] || "en";

      // Try gtts-cli first (faster)
      const tempTextPath = outputPath + ".tmp.txt";
      fs.writeFileSync(tempTextPath, text, "utf8");

      const startTime = Date.now();

      const tryCliFirst = () => {
        const gtts = spawn(
          "gtts-cli",
          ["--file", tempTextPath, "--lang", gttsLang, "--output", outputPath],
          { timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
        );

        let stderr = "";
        gtts.stderr.on("data", (d) => {
          stderr += d.toString();
        });

        gtts.on("error", () => {
          // CLI not found, try Python module
          tryPythonModule();
        });

        gtts.on("close", (code) => {
          cleanupTemp();
          if (code === 0 && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            resolve({
              success: true,
              audioPath: outputPath,
              language,
              duration: Math.round((Date.now() - startTime) / 1000),
              text,
              fileSize: stats.size,
              engine: "gtts-cli",
              exists: true,
            });
          } else {
            tryPythonModule();
          }
        });
      };

      const tryPythonModule = () => {
        const escapedText = text
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, " ");
        const escapedPath = outputPath
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"');
        const script = `
from gtts import gTTS
tts = gTTS(text="${escapedText}", lang="${gttsLang}")
tts.save("${escapedPath}")
print("OK")
`;
        const proc = spawn(this.pythonCmd, ["-c", script], {
          timeout: 60000,
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => {
          stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });

        proc.on("error", (err) => {
          cleanupTemp();
          reject(new Error(`gTTS Python failed to start: ${err.message}`));
        });

        proc.on("close", (code) => {
          cleanupTemp();
          if (code === 0 && fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            resolve({
              success: true,
              audioPath: outputPath,
              language,
              duration: Math.round((Date.now() - startTime) / 1000),
              text,
              fileSize: stats.size,
              engine: "gtts-python",
              exists: true,
            });
          } else {
            reject(
              new Error(
                `gTTS Python failed (code ${code}): ${stderr.slice(0, 300)}`,
              ),
            );
          }
        });
      };

      const cleanupTemp = () => {
        try {
          if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);
        } catch {
          /* ignore */
        }
      };

      tryCliFirst();
    });
  }

  /**
   * Synthesize with Piper (local, fast, offline)
   * @param {string} text
   * @param {string} language
   * @param {string} outputPath
   * @returns {Promise<Object>}
   */
  async synthesizeWithPiper(text, language, outputPath) {
    return new Promise((resolve, reject) => {
      const model = PIPER_MODEL_MAP[language];
      if (!model) {
        return reject(
          new Error(`Piper model not available for language: ${language}`),
        );
      }

      const startTime = Date.now();
      const wavPath = outputPath.replace(/\.mp3$/, ".wav");

      const piper = spawn(
        "piper",
        ["--model", model, "--output_file", wavPath],
        { timeout: 30000, stdio: ["pipe", "pipe", "pipe"] },
      );

      let stderr = "";
      piper.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      piper.stdin.write(text);
      piper.stdin.end();

      piper.on("error", (err) => {
        reject(new Error(`Piper failed to start: ${err.message}`));
      });

      piper.on("close", (code) => {
        if (code === 0 && fs.existsSync(wavPath)) {
          const stats = fs.statSync(wavPath);
          resolve({
            success: true,
            audioPath: wavPath,
            language,
            duration: Math.round((Date.now() - startTime) / 1000),
            text,
            fileSize: stats.size,
            engine: "piper",
            exists: true,
          });
        } else {
          reject(
            new Error(`Piper failed (code ${code}): ${stderr.slice(0, 300)}`),
          );
        }
      });
    });
  }

  /**
   * Synthesize with espeak-ng (widely available, lower quality)
   * @param {string} text
   * @param {string} language
   * @param {string} outputPath
   * @returns {Promise<Object>}
   */
  async synthesizeWithEspeak(text, language, outputPath) {
    return new Promise((resolve, reject) => {
      const espeakLang = ESPEAK_LANG_MAP[language] || "en";
      const wavPath = outputPath.replace(/\.mp3$/, ".wav");

      const startTime = Date.now();
      const cmd = process.platform === "win32" ? "espeak" : "espeak-ng";

      const espeak = spawn(
        cmd,
        [
          "-v",
          espeakLang,
          "-w",
          wavPath,
          text.slice(0, 5000), // espeak has limits
        ],
        { timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
      );

      let stderr = "";
      espeak.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      espeak.on("error", (err) => {
        reject(new Error(`espeak failed to start: ${err.message}`));
      });

      espeak.on("close", (code) => {
        if (code === 0 && fs.existsSync(wavPath)) {
          const stats = fs.statSync(wavPath);
          resolve({
            success: true,
            audioPath: wavPath,
            language,
            duration: Math.round((Date.now() - startTime) / 1000),
            text,
            fileSize: stats.size,
            engine: cmd,
            exists: true,
          });
        } else {
          reject(
            new Error(`espeak failed (code ${code}): ${stderr.slice(0, 300)}`),
          );
        }
      });
    });
  }

  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Get engine info including availability
   * @returns {Object}
   */
  getEngineInfo() {
    const engines = this._getEngines();
    return {
      preferredEngine: this.preferredEngine,
      detectedEngines: engines,
      available: engines.gtts || engines.piper || engines.espeak,
      supportedLanguages: this.supportedLanguages.length,
      ready: engines.gtts || engines.piper || engines.espeak,
      outputDir: this.outputDir,
    };
  }

  /**
   * Clean up old audio files
   * @param {number} maxAgeMs
   * @returns {number} Files deleted
   */
  cleanupOldFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
    if (!fs.existsSync(this.outputDir)) return 0;

    const now = Date.now();
    let deleted = 0;

    for (const file of fs.readdirSync(this.outputDir)) {
      const filePath = path.join(this.outputDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {
        /* skip unreadable files */
      }
    }
    return deleted;
  }
}

module.exports = { TTSProvider };
