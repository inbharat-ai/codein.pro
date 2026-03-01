/**
 * @fileoverview Cloud Voice Providers
 * High-quality fallback STT/TTS via Azure Cognitive Services and Google Cloud Speech.
 * Provides dramatically better accuracy for Indian languages compared to local-only engines.
 *
 * Provider hierarchy:
 *   STT: Azure Speech → Google Cloud Speech → local Whisper → none
 *   TTS: Azure Speech → Google Cloud TTS → local gTTS → espeak → none
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");

/**
 * Azure Cognitive Services language codes for Indian languages
 */
const AZURE_STT_LANG_MAP = {
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  or: "or-IN",
  as: "as-IN",
  ur: "ur-IN",
  en: "en-IN",
  // Extra for diaspora
  sd: "sd-IN",
  kok: "kok-IN",
};

const AZURE_TTS_VOICES = {
  hi: { name: "hi-IN-SwaraNeural", gender: "Female" },
  bn: { name: "bn-IN-TanishaaNeural", gender: "Female" },
  ta: { name: "ta-IN-PallaviNeural", gender: "Female" },
  te: { name: "te-IN-ShrutiNeural", gender: "Female" },
  kn: { name: "kn-IN-SapnaNeural", gender: "Female" },
  ml: { name: "ml-IN-SobhanaNeural", gender: "Female" },
  mr: { name: "mr-IN-AarohiNeural", gender: "Female" },
  gu: { name: "gu-IN-DhwaniNeural", gender: "Female" },
  pa: { name: "pa-IN-GurpreetNeural", gender: "Male" },
  ur: { name: "ur-IN-GulNeural", gender: "Female" },
  en: { name: "en-IN-NeerjaNeural", gender: "Female" },
};

const GOOGLE_STT_LANG_MAP = {
  hi: "hi-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  ur: "ur-IN",
  en: "en-IN",
};

const GOOGLE_TTS_VOICES = {
  hi: { name: "hi-IN-Wavenet-A", lang: "hi-IN" },
  bn: { name: "bn-IN-Wavenet-A", lang: "bn-IN" },
  ta: { name: "ta-IN-Wavenet-A", lang: "ta-IN" },
  te: { name: "te-IN-Standard-A", lang: "te-IN" },
  kn: { name: "kn-IN-Wavenet-A", lang: "kn-IN" },
  ml: { name: "ml-IN-Wavenet-A", lang: "ml-IN" },
  mr: { name: "mr-IN-Wavenet-A", lang: "mr-IN" },
  gu: { name: "gu-IN-Wavenet-A", lang: "gu-IN" },
  en: { name: "en-IN-Wavenet-A", lang: "en-IN" },
};

/**
 * @class AzureSpeechProvider
 * @description Azure Cognitive Services Speech SDK integration for STT + TTS
 */
class AzureSpeechProvider {
  constructor(options = {}) {
    this.subscriptionKey =
      options.subscriptionKey || process.env.AZURE_SPEECH_KEY || "";
    this.region =
      options.region || process.env.AZURE_SPEECH_REGION || "centralindia";
    this.outputDir =
      options.outputDir || path.join(process.cwd(), "output", "audio");
    this.tokenCache = { token: null, expiresAt: 0 };
    this._ensureOutputDir();
  }

  _ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  isConfigured() {
    return !!(this.subscriptionKey && this.region);
  }

  /**
   * Get or refresh Azure auth token
   * @returns {Promise<string>}
   */
  async _getToken() {
    if (this.tokenCache.token && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: `${this.region}.api.cognitive.microsoft.com`,
        path: "/sts/v1.0/issueToken",
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.subscriptionKey,
          "Content-Length": 0,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode === 200) {
            this.tokenCache = {
              token: data,
              expiresAt: Date.now() + 9 * 60 * 1000, // 9 min (token valid for 10)
            };
            resolve(data);
          } else {
            reject(
              new Error(
                `Azure token failed: ${res.statusCode} ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

  /**
   * Transcribe audio via Azure Speech REST API
   * @param {string} audioPath - Path to WAV/OGG/FLAC audio file
   * @param {string} language - Language code (e.g., 'hi', 'ta')
   * @returns {Promise<Object>}
   */
  async transcribe(audioPath, language = "en") {
    if (!this.isConfigured()) {
      throw new Error(
        "Azure Speech not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
      );
    }

    const azureLang = AZURE_STT_LANG_MAP[language];
    if (!azureLang) {
      throw new Error(`Azure STT does not support language: ${language}`);
    }

    const token = await this._getToken();
    const audioData = fs.readFileSync(audioPath);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: `${this.region}.stt.speech.microsoft.com`,
        path: `/speech/recognition/conversation/cognitiveservices/v1?language=${azureLang}&format=detailed`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
          "Content-Length": audioData.length,
        },
      };

      const startTime = Date.now();
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const duration = Date.now() - startTime;

          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Azure STT failed: ${res.statusCode} ${data.slice(0, 300)}`,
              ),
            );
            return;
          }

          try {
            const result = JSON.parse(data);
            const bestResult = result.NBest?.[0] || {};
            resolve({
              success: true,
              text: result.DisplayText || bestResult.Display || "",
              language,
              confidence: bestResult.Confidence || 0.85,
              audioPath,
              duration,
              engine: "azure-speech",
              details: {
                recognitionStatus: result.RecognitionStatus,
                offset: result.Offset,
                duration: result.Duration,
              },
            });
          } catch (err) {
            reject(new Error(`Azure STT parse error: ${err.message}`));
          }
        });
      });

      req.on("error", reject);
      req.write(audioData);
      req.end();
    });
  }

  /**
   * Synthesize speech via Azure TTS REST API
   * @param {string} text
   * @param {string} language
   * @param {string} [outputPath]
   * @returns {Promise<Object>}
   */
  async synthesize(text, language = "en", outputPath = null) {
    if (!this.isConfigured()) {
      throw new Error(
        "Azure TTS not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
      );
    }

    const voice = AZURE_TTS_VOICES[language];
    if (!voice) {
      throw new Error(`Azure TTS does not support language: ${language}`);
    }

    if (!outputPath) {
      const hash = crypto
        .createHash("md5")
        .update(text + language)
        .digest("hex")
        .substring(0, 8);
      outputPath = path.join(
        this.outputDir,
        `azure_tts_${language}_${hash}.mp3`,
      );
    }

    // Return cached if exists
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return {
        success: true,
        audioPath: outputPath,
        language,
        text,
        engine: "azure-speech-cached",
        cached: true,
      };
    }

    const token = await this._getToken();

    const ssml = `<speak version='1.0' xml:lang='${AZURE_STT_LANG_MAP[language] || "en-IN"}'>
  <voice name='${voice.name}'>
    <prosody rate='0%' pitch='0%'>${escapeXml(text)}</prosody>
  </voice>
</speak>`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: `${this.region}.tts.speech.microsoft.com`,
        path: "/cognitiveservices/v1",
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
          "Content-Length": Buffer.byteLength(ssml, "utf8"),
        },
      };

      const startTime = Date.now();
      const req = https.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errData = "";
          res.on("data", (chunk) => {
            errData += chunk;
          });
          res.on("end", () => {
            reject(
              new Error(
                `Azure TTS failed: ${res.statusCode} ${errData.slice(0, 300)}`,
              ),
            );
          });
          return;
        }

        const writeStream = fs.createWriteStream(outputPath);
        res.pipe(writeStream);

        writeStream.on("finish", () => {
          const stats = fs.statSync(outputPath);
          resolve({
            success: true,
            audioPath: outputPath,
            language,
            duration: Math.round((Date.now() - startTime) / 1000),
            text,
            fileSize: stats.size,
            engine: "azure-speech",
            voice: voice.name,
          });
        });

        writeStream.on("error", reject);
      });

      req.on("error", reject);
      req.write(ssml);
      req.end();
    });
  }

  getSupportedSTTLanguages() {
    return Object.keys(AZURE_STT_LANG_MAP);
  }

  getSupportedTTSLanguages() {
    return Object.keys(AZURE_TTS_VOICES);
  }

  getInfo() {
    return {
      provider: "azure-speech",
      configured: this.isConfigured(),
      region: this.region,
      sttLanguages: this.getSupportedSTTLanguages().length,
      ttsLanguages: this.getSupportedTTSLanguages().length,
      ttsVoices: Object.entries(AZURE_TTS_VOICES).map(([lang, v]) => ({
        language: lang,
        voice: v.name,
        gender: v.gender,
      })),
    };
  }
}

/**
 * @class GoogleCloudSpeechProvider
 * @description Google Cloud Speech-to-Text and Text-to-Speech integration
 */
class GoogleCloudSpeechProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GOOGLE_CLOUD_SPEECH_KEY || "";
    this.outputDir =
      options.outputDir || path.join(process.cwd(), "output", "audio");
    this._ensureOutputDir();
  }

  _ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Transcribe audio via Google Cloud Speech-to-Text REST API
   * @param {string} audioPath
   * @param {string} language
   * @returns {Promise<Object>}
   */
  async transcribe(audioPath, language = "en") {
    if (!this.isConfigured()) {
      throw new Error(
        "Google Cloud Speech not configured. Set GOOGLE_CLOUD_SPEECH_KEY.",
      );
    }

    const googleLang = GOOGLE_STT_LANG_MAP[language];
    if (!googleLang) {
      throw new Error(`Google STT does not support language: ${language}`);
    }

    const audioData = fs.readFileSync(audioPath);
    const audioBase64 = audioData.toString("base64");

    const requestBody = JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: googleLang,
        enableAutomaticPunctuation: true,
        model: "latest_long",
        useEnhanced: true,
        // Enable better Indian language recognition
        alternativeLanguageCodes: language !== "en" ? ["en-IN"] : [],
      },
      audio: {
        content: audioBase64,
      },
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "speech.googleapis.com",
        path: `/v1/speech:recognize?key=${this.apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      };

      const startTime = Date.now();
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const duration = Date.now() - startTime;

          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Google STT failed: ${res.statusCode} ${data.slice(0, 300)}`,
              ),
            );
            return;
          }

          try {
            const result = JSON.parse(data);
            const bestAlt = result.results?.[0]?.alternatives?.[0] || {};
            const fullText = (result.results || [])
              .map((r) => r.alternatives?.[0]?.transcript || "")
              .join(" ");

            resolve({
              success: true,
              text: fullText.trim(),
              language,
              confidence: bestAlt.confidence || 0.85,
              audioPath,
              duration,
              engine: "google-cloud-speech",
              details: {
                resultCount: result.results?.length || 0,
              },
            });
          } catch (err) {
            reject(new Error(`Google STT parse error: ${err.message}`));
          }
        });
      });

      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Synthesize speech via Google Cloud TTS REST API
   * @param {string} text
   * @param {string} language
   * @param {string} [outputPath]
   * @returns {Promise<Object>}
   */
  async synthesize(text, language = "en", outputPath = null) {
    if (!this.isConfigured()) {
      throw new Error(
        "Google Cloud TTS not configured. Set GOOGLE_CLOUD_SPEECH_KEY.",
      );
    }

    const voice = GOOGLE_TTS_VOICES[language];
    if (!voice) {
      throw new Error(`Google TTS does not support language: ${language}`);
    }

    if (!outputPath) {
      const hash = crypto
        .createHash("md5")
        .update(text + language)
        .digest("hex")
        .substring(0, 8);
      outputPath = path.join(
        this.outputDir,
        `google_tts_${language}_${hash}.mp3`,
      );
    }

    // Return cached if exists
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return {
        success: true,
        audioPath: outputPath,
        language,
        text,
        engine: "google-cloud-tts-cached",
        cached: true,
      };
    }

    const requestBody = JSON.stringify({
      input: { text },
      voice: {
        languageCode: voice.lang,
        name: voice.name,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 1.0,
        pitch: 0,
        sampleRateHertz: 24000,
      },
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "texttospeech.googleapis.com",
        path: `/v1/text:synthesize?key=${this.apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
        },
      };

      const startTime = Date.now();
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `Google TTS failed: ${res.statusCode} ${data.slice(0, 300)}`,
              ),
            );
            return;
          }

          try {
            const result = JSON.parse(data);
            const audioContent = result.audioContent;

            if (!audioContent) {
              reject(new Error("Google TTS returned no audio content"));
              return;
            }

            fs.writeFileSync(outputPath, Buffer.from(audioContent, "base64"));
            const stats = fs.statSync(outputPath);

            resolve({
              success: true,
              audioPath: outputPath,
              language,
              duration: Math.round((Date.now() - startTime) / 1000),
              text,
              fileSize: stats.size,
              engine: "google-cloud-tts",
              voice: voice.name,
            });
          } catch (err) {
            reject(new Error(`Google TTS parse error: ${err.message}`));
          }
        });
      });

      req.on("error", reject);
      req.write(requestBody);
      req.end();
    });
  }

  getSupportedSTTLanguages() {
    return Object.keys(GOOGLE_STT_LANG_MAP);
  }

  getSupportedTTSLanguages() {
    return Object.keys(GOOGLE_TTS_VOICES);
  }

  getInfo() {
    return {
      provider: "google-cloud-speech",
      configured: this.isConfigured(),
      sttLanguages: this.getSupportedSTTLanguages().length,
      ttsLanguages: this.getSupportedTTSLanguages().length,
    };
  }
}

/**
 * @class CloudVoiceManager
 * @description Unified manager for cloud voice providers with automatic fallback
 *
 * Fallback chain:
 *   STT: Azure → Google → (caller handles local fallback)
 *   TTS: Azure → Google → (caller handles local fallback)
 */
class CloudVoiceManager {
  constructor(options = {}) {
    this.azure = new AzureSpeechProvider(options.azure || {});
    this.google = new GoogleCloudSpeechProvider(options.google || {});
    this.stats = {
      sttAttempts: 0,
      sttSuccesses: 0,
      ttsAttempts: 0,
      ttsSuccesses: 0,
      providerUsage: {},
    };
  }

  /**
   * Check which cloud providers are available
   * @returns {Object}
   */
  getAvailability() {
    return {
      azure: this.azure.isConfigured(),
      google: this.google.isConfigured(),
      anyAvailable: this.azure.isConfigured() || this.google.isConfigured(),
    };
  }

  /**
   * Transcribe audio with automatic cloud provider fallback
   * @param {string} audioPath
   * @param {string} language
   * @returns {Promise<Object>} Result or throws if all cloud providers fail
   */
  async transcribe(audioPath, language = "en") {
    this.stats.sttAttempts++;
    const errors = [];

    // Try Azure first (better Indian language support)
    if (this.azure.isConfigured()) {
      try {
        const result = await this.azure.transcribe(audioPath, language);
        this.stats.sttSuccesses++;
        this._trackUsage("azure-stt");
        return result;
      } catch (err) {
        errors.push(`Azure: ${err.message}`);
        console.warn("[CloudVoice] Azure STT failed:", err.message);
      }
    }

    // Try Google
    if (this.google.isConfigured()) {
      try {
        const result = await this.google.transcribe(audioPath, language);
        this.stats.sttSuccesses++;
        this._trackUsage("google-stt");
        return result;
      } catch (err) {
        errors.push(`Google: ${err.message}`);
        console.warn("[CloudVoice] Google STT failed:", err.message);
      }
    }

    throw new Error(`All cloud STT providers failed: ${errors.join("; ")}`);
  }

  /**
   * Synthesize speech with automatic cloud provider fallback
   * @param {string} text
   * @param {string} language
   * @param {string} [outputPath]
   * @returns {Promise<Object>}
   */
  async synthesize(text, language = "en", outputPath = null) {
    this.stats.ttsAttempts++;
    const errors = [];

    // Try Azure first
    if (this.azure.isConfigured()) {
      try {
        const result = await this.azure.synthesize(text, language, outputPath);
        this.stats.ttsSuccesses++;
        this._trackUsage("azure-tts");
        return result;
      } catch (err) {
        errors.push(`Azure: ${err.message}`);
        console.warn("[CloudVoice] Azure TTS failed:", err.message);
      }
    }

    // Try Google
    if (this.google.isConfigured()) {
      try {
        const result = await this.google.synthesize(text, language, outputPath);
        this.stats.ttsSuccesses++;
        this._trackUsage("google-tts");
        return result;
      } catch (err) {
        errors.push(`Google: ${err.message}`);
        console.warn("[CloudVoice] Google TTS failed:", err.message);
      }
    }

    throw new Error(`All cloud TTS providers failed: ${errors.join("; ")}`);
  }

  _trackUsage(provider) {
    this.stats.providerUsage[provider] =
      (this.stats.providerUsage[provider] || 0) + 1;
  }

  /**
   * Configure a provider at runtime
   * @param {"azure"|"google"} provider
   * @param {Object} config
   */
  configure(provider, config) {
    if (provider === "azure") {
      if (config.subscriptionKey)
        this.azure.subscriptionKey = config.subscriptionKey;
      if (config.region) this.azure.region = config.region;
    } else if (provider === "google") {
      if (config.apiKey) this.google.apiKey = config.apiKey;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  getInfo() {
    return {
      azure: this.azure.getInfo(),
      google: this.google.getInfo(),
      stats: this.getStats(),
    };
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = {
  AzureSpeechProvider,
  GoogleCloudSpeechProvider,
  CloudVoiceManager,
  AZURE_STT_LANG_MAP,
  AZURE_TTS_VOICES,
  GOOGLE_STT_LANG_MAP,
  GOOGLE_TTS_VOICES,
};
