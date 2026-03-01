/**
 * @fileoverview Speech-to-Text (STT) Provider
 * Real voice input support for Indian languages via Whisper with graceful fallback.
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

/**
 * Detect which STT engine is available on the system
 * @returns {"whisper"|"whisper.cpp"|"none"}
 */
function detectSTTEngine() {
  try {
    execSync("whisper --help", { stdio: "ignore", timeout: 5000 });
    return "whisper";
  } catch {
    /* not found */
  }

  try {
    execSync("whisper-cpp --help", { stdio: "ignore", timeout: 5000 });
    return "whisper.cpp";
  } catch {
    /* not found */
  }

  // Check for whisper in Python
  try {
    execSync('python -c "import whisper"', { stdio: "ignore", timeout: 10000 });
    return "whisper";
  } catch {
    /* not found */
  }

  try {
    execSync('python3 -c "import whisper"', {
      stdio: "ignore",
      timeout: 10000,
    });
    return "whisper";
  } catch {
    /* not found */
  }

  return "none";
}

const WHISPER_LANG_MAP = {
  hi: "hindi",
  bn: "bengali",
  ta: "tamil",
  te: "telugu",
  kn: "kannada",
  ml: "malayalam",
  mr: "marathi",
  gu: "gujarati",
  pa: "punjabi",
  ur: "urdu",
  en: "english",
  or: "odia",
  as: "assamese",
};

/**
 * @class STTProvider
 * @description Speech-to-Text provider with Whisper integration and multi-language support
 */
class STTProvider {
  constructor(options = {}) {
    this.sttEngine = options.engine || "auto";
    this.detectedEngine = null; // lazily detected
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
    this.modelPath =
      options.modelPath || path.join(process.cwd(), "models", "stt");
    this.modelSize = options.modelSize || "base"; // tiny, base, small, medium, large
    this.pythonCmd =
      options.pythonCmd ||
      (process.platform === "win32" ? "python" : "python3");
  }

  /**
   * Lazily detect the available engine
   * @returns {string}
   */
  _getEngine() {
    if (this.sttEngine !== "auto") return this.sttEngine;
    if (!this.detectedEngine) {
      this.detectedEngine = detectSTTEngine();
    }
    return this.detectedEngine;
  }

  /**
   * Check if language is supported
   * @param {string} langCode
   * @returns {boolean}
   */
  isLanguageSupported(langCode) {
    return this.supportedLanguages.includes(langCode);
  }

  /**
   * Transcribe audio file to text
   * @param {string} audioPath - Path to audio file (wav, mp3, m4a, flac, ogg)
   * @param {string} language - Language code
   * @returns {Promise<Object>} Transcription result
   */
  async transcribe(audioPath, language = "en") {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    if (!this.isLanguageSupported(language)) {
      throw new Error(`Language not supported: ${language}`);
    }

    const engine = this._getEngine();

    // Try real engine first, fall back gracefully
    if (engine === "whisper") {
      try {
        return await this.transcribeWithWhisper(audioPath, language);
      } catch (err) {
        // Log and fall back to Python module approach
        console.warn(
          `[STT] Whisper CLI failed: ${err.message}, trying Python module...`,
        );
        try {
          return await this.transcribeWithWhisperPython(audioPath, language);
        } catch (err2) {
          console.warn(
            `[STT] Whisper Python failed: ${err2.message}, returning error`,
          );
          return {
            success: false,
            text: "",
            language,
            confidence: 0,
            audioPath,
            engine: "whisper",
            error: `Whisper transcription failed: ${err2.message}`,
          };
        }
      }
    }

    // No engine available — return clear error instead of simulation
    return {
      success: false,
      text: "",
      language,
      confidence: 0,
      audioPath,
      engine: "none",
      error:
        "No STT engine available. Install OpenAI Whisper: pip install openai-whisper",
      installGuide: {
        whisper: "pip install openai-whisper",
        requirements: "Requires Python 3.8+ and ffmpeg",
      },
    };
  }

  /**
   * Transcribe using Whisper CLI (openai-whisper package)
   * @param {string} audioPath
   * @param {string} language
   * @returns {Promise<Object>}
   */
  async transcribeWithWhisper(audioPath, language) {
    return new Promise((resolve, reject) => {
      const whisperLang = WHISPER_LANG_MAP[language] || "english";
      const outputDir = path.dirname(audioPath);
      const baseName = path.basename(audioPath, path.extname(audioPath));

      const args = [
        audioPath,
        "--language",
        whisperLang,
        "--model",
        this.modelSize,
        "--output_format",
        "json",
        "--output_dir",
        outputDir,
      ];

      const startTime = Date.now();
      const whisper = spawn("whisper", args, {
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      whisper.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      whisper.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      whisper.on("error", (err) => {
        reject(new Error(`Failed to start Whisper: ${err.message}`));
      });

      whisper.on("close", (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          reject(
            new Error(
              `Whisper exited with code ${code}: ${stderr.slice(0, 500)}`,
            ),
          );
          return;
        }

        // Whisper outputs a .json file next to the input
        const jsonOutputPath = path.join(outputDir, baseName + ".json");

        let text = "";
        let confidence = 0.85;

        if (fs.existsSync(jsonOutputPath)) {
          try {
            const result = JSON.parse(fs.readFileSync(jsonOutputPath, "utf8"));
            text = result.text || "";
            // Calculate average confidence from segments
            if (result.segments && result.segments.length > 0) {
              const avgNoSpeechProb =
                result.segments.reduce(
                  (sum, s) => sum + (s.no_speech_prob || 0),
                  0,
                ) / result.segments.length;
              confidence = Math.max(0, 1 - avgNoSpeechProb);
            }
            // Clean up JSON output
            try {
              fs.unlinkSync(jsonOutputPath);
            } catch {
              /* ignore */
            }
          } catch {
            text = stdout.trim();
          }
        } else {
          // Parse from stdout if no JSON file
          text = stdout.trim();
        }

        resolve({
          success: true,
          text: text.trim(),
          language,
          confidence: parseFloat(confidence.toFixed(3)),
          audioPath,
          duration: Math.round(duration),
          engine: "whisper",
        });
      });
    });
  }

  /**
   * Transcribe using Whisper Python module directly
   * @param {string} audioPath
   * @param {string} language
   * @returns {Promise<Object>}
   */
  async transcribeWithWhisperPython(audioPath, language) {
    return new Promise((resolve, reject) => {
      const whisperLang = WHISPER_LANG_MAP[language] || "english";
      const escapedPath = audioPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      const script = `
import json, sys
try:
    import whisper
    model = whisper.load_model("${this.modelSize}")
    result = model.transcribe("${escapedPath}", language="${whisperLang}")
    segments = result.get("segments", [])
    avg_conf = 1.0
    if segments:
        avg_conf = max(0, 1 - sum(s.get("no_speech_prob", 0) for s in segments) / len(segments))
    print(json.dumps({"text": result["text"], "confidence": round(avg_conf, 3), "language": "${language}"}))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

      const startTime = Date.now();
      const proc = spawn(this.pythonCmd, ["-c", script], {
        timeout: 180000,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to start Python: ${err.message}`));
      });

      proc.on("close", (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          reject(new Error(`Whisper Python failed: ${stderr.slice(0, 500)}`));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          if (result.error) {
            reject(new Error(result.error));
            return;
          }
          resolve({
            success: true,
            text: (result.text || "").trim(),
            language: result.language || language,
            confidence: result.confidence || 0.85,
            audioPath,
            duration: Math.round(duration),
            engine: "whisper-python",
          });
        } catch (e) {
          reject(
            new Error(
              `Failed to parse Whisper output: ${stdout.slice(0, 200)}`,
            ),
          );
        }
      });
    });
  }

  /**
   * Get supported languages
   * @returns {string[]}
   */
  getSupportedLanguages() {
    return [...this.supportedLanguages];
  }

  /**
   * Get engine info including availability status
   * @returns {Object}
   */
  getEngineInfo() {
    const engine = this._getEngine();
    return {
      engine: this.sttEngine === "auto" ? engine : this.sttEngine,
      detectedEngine: engine,
      available: engine !== "none",
      supportedLanguages: this.supportedLanguages.length,
      modelSize: this.modelSize,
      ready: engine !== "none",
    };
  }
}

module.exports = { STTProvider };
