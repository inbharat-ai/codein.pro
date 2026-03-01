/**
 * I18n Orchestrator
 * Handles translation, STT, TTS with provider hierarchy
 * Supports 18+ Indian languages with multilingual capabilities
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Import language configuration (18 languages)
const {
  LANGUAGE_CONFIG,
  getAllLanguageCodes,
  getLanguageConfig,
} = require("./language-config.js");

// Import voice providers
const { STTProvider } = require("./stt-provider.js");
const { TTSProvider } = require("./tts-provider.js");

// Import cloud voice providers and technical term preservator
let CloudVoiceManager, TechnicalTermPreservator;
try {
  ({ CloudVoiceManager } = require("./cloud-voice-providers.js"));
  ({ TechnicalTermPreservator } = require("./technical-term-preservator.js"));
} catch (err) {
  console.warn("[I18n] Optional modules not loaded:", err.message);
}

const CODIN_DIR = path.join(os.homedir(), ".codin");
const I18N_DIR = path.join(CODIN_DIR, "i18n");
const DEFAULT_LLAMA_ENDPOINT = "http://127.0.0.1:8080";

async function getFetch() {
  if (typeof fetch === "function") {
    return fetch;
  }
  const module = await import("node-fetch");
  return module.default;
}

// Generate language detection patterns from config
const LANGUAGE_PATTERNS = {};
Object.entries(LANGUAGE_CONFIG).forEach(([code, config]) => {
  if (config.unicodeStart && config.unicodeEnd) {
    const start = config.unicodeStart
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
    const end = config.unicodeEnd.toString(16).toUpperCase().padStart(4, "0");
    LANGUAGE_PATTERNS[code] = new RegExp(`[\\u${start}-\\u${end}]`);
  }
});

// Special case for English (ASCII)
LANGUAGE_PATTERNS.en = /^[a-zA-Z0-9\s.,!?'"()-]+$/;

class I18nOrchestrator {
  constructor() {
    this.translationProvider = null;
    this.sttProvider = new STTProvider({ engine: "whisper" });
    this.ttsProvider = new TTSProvider({ engine: "gtts" });
    this.cloudVoice = CloudVoiceManager ? new CloudVoiceManager() : null;
    this.termPreservator = TechnicalTermPreservator
      ? new TechnicalTermPreservator()
      : null;
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(I18N_DIR)) {
      fs.mkdirSync(I18N_DIR, { recursive: true });
    }
  }

  /**
   * Normalize language code
   */
  normalizeLanguage(lang) {
    if (!lang) return "en";
    const normalized = lang.toLowerCase();

    // Check if it's a valid language code
    if (LANGUAGE_CONFIG[normalized]) {
      return normalized;
    }

    // Try first 2 characters
    const short = normalized.substring(0, 2);
    return LANGUAGE_CONFIG[short] ? short : "en";
  }

  /**
   * Get all supported languages
   */
  getSupportedLanguages() {
    return getAllLanguageCodes();
  }

  /**
   * Get language metadata
   */
  getLanguageInfo(langCode) {
    return getLanguageConfig(langCode);
  }

  /**
   * Detect language from text
   */
  detectLanguage(text) {
    if (!text || text.trim().length === 0) return "en";

    // Check each language pattern
    for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
      if (pattern.test(text)) {
        // For multi-script texts, prioritize non-English
        if (lang !== "en") {
          return lang;
        }
      }
    }

    return "en"; // Default to English
  }

  /**
   * Translate text with technical term preservation
   */
  async translate(text, sourceLang, targetLang) {
    sourceLang = this.normalizeLanguage(sourceLang);
    targetLang = this.normalizeLanguage(targetLang);

    if (sourceLang === targetLang) {
      return text;
    }

    // Use technical term preservator if available
    if (this.termPreservator) {
      const rawTranslateFn = async (cleanText, src, tgt) => {
        return await this._rawTranslate(cleanText, src, tgt);
      };
      const result = await this.termPreservator.translateWithPreservation(
        text,
        sourceLang,
        targetLang,
        rawTranslateFn,
      );
      return result.text;
    }

    // Fallback: translate without term preservation
    return await this._rawTranslate(text, sourceLang, targetLang);
  }

  /**
   * Raw translation without term preservation (used internally)
   */
  async _rawTranslate(text, sourceLang, targetLang) {
    // Try translation providers in order
    const providers = this.getTranslationProviders();

    for (const provider of providers) {
      try {
        const result = await provider.translate(text, sourceLang, targetLang);
        return result;
      } catch (error) {
        console.warn(`[I18n] Provider ${provider.name} failed:`, error.message);
        continue;
      }
    }

    throw new Error("All translation providers failed");
  }

  /**
   * Translate to English if needed
   */
  async translateToEnglishIfNeeded(text, sourceLang = null) {
    if (!sourceLang) {
      sourceLang = this.detectLanguage(text);
    }

    if (sourceLang === "en") {
      return { text, language: "en", translated: false };
    }

    const translated = await this.translate(text, sourceLang, "en");
    return { text: translated, language: sourceLang, translated: true };
  }

  /**
   * Translate from English if needed
   */
  async translateFromEnglishIfNeeded(text, targetLang) {
    targetLang = this.normalizeLanguage(targetLang);

    if (targetLang === "en") {
      return { text, translated: false };
    }

    const translated = await this.translate(text, "en", targetLang);
    return { text: translated, translated: true };
  }

  /**
   * Speech-to-Text
   */
  async stt(audioPath, lang) {
    lang = this.normalizeLanguage(lang);

    const providers = this.getSTTProviders();

    for (const provider of providers) {
      try {
        const result = await provider.transcribe(audioPath, lang);
        return result;
      } catch (error) {
        console.warn(
          `[I18n] STT Provider ${provider.name} failed:`,
          error.message,
        );
        continue;
      }
    }

    throw new Error("All STT providers failed");
  }

  /**
   * Text-to-Speech
   */
  async tts(text, lang, outputPath) {
    lang = this.normalizeLanguage(lang);

    const providers = this.getTTSProviders();

    for (const provider of providers) {
      try {
        const result = await provider.synthesize(text, lang, outputPath);
        return result;
      } catch (error) {
        console.warn(
          `[I18n] TTS Provider ${provider.name} failed:`,
          error.message,
        );
        continue;
      }
    }

    throw new Error("All TTS providers failed");
  }

  /**
   * Get translation providers in priority order
   */
  getTranslationProviders() {
    const providers = [];

    // 1. AI4Bharat/Indic (if available)
    if (this.translationProvider) {
      providers.push(this.translationProvider);
    }

    // 2. Local LLM fallback
    providers.push(new LLMTranslationProvider());

    return providers;
  }

  /**
   * Get STT providers in priority order (cloud → local)
   */
  getSTTProviders() {
    const providers = [];

    // 1. Cloud voice providers (Azure/Google — best quality for Indian languages)
    if (this.cloudVoice && this.cloudVoice.getAvailability().anyAvailable) {
      providers.push({
        name: "Cloud STT (Azure/Google)",
        transcribe: (audioPath, lang) =>
          this.cloudVoice.transcribe(audioPath, lang),
      });
    }

    // 2. Primary local STT provider (Whisper)
    if (this.sttProvider) {
      providers.push({
        name: "Local STT (Whisper)",
        transcribe: (audioPath, lang) =>
          this.sttProvider.transcribe(audioPath, lang),
      });
    }

    return providers.length > 0
      ? providers
      : [
          {
            name: "Default STT",
            transcribe: async (audioPath, lang) => ({
              success: true,
              text: "[STT not configured]",
              language: lang,
              confidence: 0,
              note: "Install Whisper or configure Azure/Google Cloud Speech for STT",
            }),
          },
        ];
  }

  /**
   * Get TTS providers in priority order (cloud → local)
   */
  getTTSProviders() {
    const providers = [];

    // 1. Cloud voice providers (Azure/Google — neural voices)
    if (this.cloudVoice && this.cloudVoice.getAvailability().anyAvailable) {
      providers.push({
        name: "Cloud TTS (Azure/Google)",
        synthesize: (text, lang, outputPath) =>
          this.cloudVoice.synthesize(text, lang, outputPath),
      });
    }

    // 2. Primary local TTS provider (gTTS/Piper/espeak)
    if (this.ttsProvider) {
      providers.push({
        name: "Local TTS (gTTS/Piper)",
        synthesize: (text, lang, outputPath) =>
          this.ttsProvider.synthesize(text, lang, outputPath),
      });
    }

    return providers.length > 0
      ? providers
      : [
          {
            name: "Default TTS",
            synthesize: async (text, lang, outputPath) => ({
              success: true,
              audioPath: outputPath || "/dev/null",
              language: lang,
              text: text,
              note: "Install gTTS/Piper or configure Azure/Google Cloud for TTS",
            }),
          },
        ];
  }

  /**
   * Register custom providers
   */
  registerTranslationProvider(provider) {
    this.translationProvider = provider;
  }

  registerSTTProvider(provider) {
    this.sttProvider = provider;
  }

  registerTTSProvider(provider) {
    this.ttsProvider = provider;
  }

  /**
   * Configure cloud voice provider (Azure or Google)
   * @param {"azure"|"google"} provider
   * @param {Object} config - { subscriptionKey, region } for Azure, { apiKey } for Google
   */
  configureCloudVoice(provider, config) {
    if (this.cloudVoice) {
      this.cloudVoice.configure(provider, config);
    }
  }

  /**
   * Get cloud voice availability and stats
   */
  getCloudVoiceInfo() {
    return this.cloudVoice ? this.cloudVoice.getInfo() : { available: false };
  }

  /**
   * Get term preservation stats
   */
  getTermPreservationStats() {
    return this.termPreservator ? this.termPreservator.getStats() : null;
  }

  /**
   * Translate a single technical term using the glossary
   * @param {string} term - English technical term
   * @param {string} targetLang - Target language code
   * @returns {string|null}
   */
  translateTechnicalTerm(term, targetLang) {
    return this.termPreservator
      ? this.termPreservator.translateTerm(term, targetLang)
      : null;
  }

  /**
   * Analyze how technical a given text is
   * @param {string} text
   * @returns {Object}
   */
  analyzeTechnicalDensity(text) {
    return this.termPreservator
      ? this.termPreservator.analyzeTechnicalDensity(text)
      : { density: 0, technicalTokens: 0, totalTokens: 0 };
  }
}

/**
 * LLM Translation Provider (fallback using local model)
 */
class LLMTranslationProvider {
  constructor() {
    this.name = "LLM Translation";
  }

  async translate(text, sourceLang, targetLang) {
    const endpoint = process.env.CODIN_LLAMA_ENDPOINT || DEFAULT_LLAMA_ENDPOINT;
    const prompt = `Translate the following ${SUPPORTED_LANGUAGES[sourceLang]?.name || sourceLang} text to ${SUPPORTED_LANGUAGES[targetLang]?.name || targetLang}. Provide ONLY the translation, no explanations.\n\n${text}`;

    const doFetch = await getFetch();
    const response = await doFetch(`${endpoint}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        n_predict: 256,
        temperature: 0.1,
        top_p: 0.9,
        stop: ["\n\n"],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`LLM translation failed: ${response.status} ${message}`);
    }

    const data = await response.json();
    const rawText = data?.content || data?.response || "";
    const translated = String(rawText).trim();

    if (!translated) {
      throw new Error("LLM translation returned empty response");
    }

    return translated;
  }
}

/**
 * Whisper.cpp STT Provider
 */
class WhisperSTTProvider {
  constructor() {
    this.name = "Whisper STT";
  }

  async transcribe(audioPath, lang) {
    // Check if Whisper is available
    const whisperPath = this.findWhisperInPath();

    if (!whisperPath) {
      throw new Error("Whisper not found");
    }

    // Run whisper transcription
    const { spawn } = require("node:child_process");

    return new Promise((resolve, reject) => {
      const args = ["-m", "base", "-l", lang, "-f", audioPath];
      const process = spawn(whisperPath, args);

      let output = "";

      process.stdout.on("data", (data) => {
        output += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Whisper failed with code ${code}`));
        }
      });
    });
  }

  findWhisperInPath() {
    // Check if whisper is in PATH
    const PATH = process.env.PATH || "";
    const paths = PATH.split(path.delimiter);
    const executable = os.platform() === "win32" ? "whisper.exe" : "whisper";

    for (const dir of paths) {
      const fullPath = path.join(dir, executable);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    return null;
  }
}

/**
 * OS TTS Provider
 */
class OSTTSProvider {
  constructor() {
    this.name = "OS TTS";
  }

  async synthesize(text, lang, outputPath) {
    const platform = os.platform();

    let command;
    let args;

    if (platform === "darwin") {
      // macOS: use 'say' command
      const voice = this.getMacVoice(lang);
      command = "say";
      args = ["-v", voice, "-o", outputPath, text];
    } else if (platform === "win32") {
      // Windows: use PowerShell SAPI
      const script = `
        Add-Type -AssemblyName System.Speech;
        $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
        $synth.SetOutputToWaveFile('${outputPath}');
        $synth.Speak('${text.replace(/'/g, "''")}');
        $synth.Dispose();
      `;
      command = "powershell";
      args = ["-Command", script];
    } else if (platform === "linux") {
      // Linux: use espeak
      command = "espeak";
      args = ["-w", outputPath, text];
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const { spawn } = require("node:child_process");

    return new Promise((resolve, reject) => {
      const process = spawn(command, args);

      process.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          reject(new Error(`TTS failed with code ${code}`));
        }
      });

      process.on("error", (err) => {
        reject(err);
      });
    });
  }

  getMacVoice(lang) {
    const voiceMap = {
      hi: "Lekha", // Hindi
      as: "Veena", // Closest: Indian English
      ta: "Veena", // Closest: Indian English
      en: "Samantha",
    };
    return voiceMap[lang] || "Samantha";
  }
}

const i18nOrchestrator = new I18nOrchestrator();

module.exports = { i18nOrchestrator, SUPPORTED_LANGUAGES: LANGUAGE_CONFIG };
