/**
 * CodeIn Compute — Multilingual Adapter
 *
 * End-to-end multilingual support for compute jobs:
 * 1. Detect input language (typed or voice)
 * 2. Translate to English for internal processing (term-preserved)
 * 3. Execute compute pipeline in English
 * 4. Translate outputs back to user's language
 * 5. Optionally respond via TTS in user's language
 *
 * Wraps existing i18n orchestrator, language detector, and term preservator.
 */
"use strict";

class ComputeMultilingualAdapter {
  /**
   * @param {object} deps
   * @param {object} [deps.i18nOrchestrator] - Existing I18nOrchestrator
   * @param {object} [deps.languageDetector] - Existing LanguageDetector
   * @param {object} [deps.termPreservator] - Existing TechnicalTermPreservator
   */
  constructor({
    i18nOrchestrator = null,
    languageDetector = null,
    termPreservator = null,
  } = {}) {
    this.i18n = i18nOrchestrator;
    this.detector = languageDetector;
    this.termPreservator = termPreservator;
  }

  /**
   * Process input: detect language, translate if needed, preserve terms.
   * @param {object} params
   * @param {string} params.text - User's input text
   * @param {string} [params.audioPath] - Path to audio file (voice input)
   * @param {string} [params.hintLanguage] - Language hint from user
   * @returns {Promise<object>} { english, original, language, confidence, termsPreserved }
   */
  async processInput({ text, audioPath, hintLanguage }) {
    let inputText = text;
    let language = hintLanguage || "en";
    let confidence = 1.0;

    // Voice input: STT first
    if (audioPath && this.i18n) {
      try {
        const sttResult = await this.i18n.stt(
          audioPath,
          hintLanguage || undefined,
        );
        inputText = sttResult.text || sttResult;
        if (sttResult.language) language = sttResult.language;
        if (sttResult.confidence) confidence = sttResult.confidence;
      } catch (err) {
        throw new Error(`Speech-to-text failed: ${err.message}`);
      }
    }

    if (!inputText || typeof inputText !== "string") {
      throw new Error("No input text provided (and STT did not produce text)");
    }

    // Detect language if not already known
    if (!hintLanguage && this.detector) {
      try {
        const detection = this.detector.detectLanguage(inputText);
        if (detection && detection.language) {
          language = detection.language;
          confidence = detection.confidence || confidence;
        }
      } catch {
        // Fall back to 'en'
      }
    }

    // If confidence is low, mark for user confirmation
    const needsConfirmation = confidence < 0.6;

    // If already English, no translation needed
    if (language === "en") {
      return {
        english: inputText,
        original: inputText,
        language: "en",
        confidence,
        needsConfirmation: false,
        termsPreserved: 0,
      };
    }

    // Preserve technical terms before translation
    let prepared = inputText;
    let termsMap = null;
    let termsPreserved = 0;

    if (this.termPreservator) {
      try {
        const preserved = this.termPreservator.protect(inputText);
        prepared = preserved.text || preserved.processed || inputText;
        termsMap = preserved.map || preserved.terms || null;
        termsPreserved =
          preserved.count ||
          (termsMap ? termsMap.size || Object.keys(termsMap).length : 0);
      } catch {
        // Term preservation failed — continue without it
      }
    }

    // Translate to English
    let english = prepared;
    if (this.i18n) {
      try {
        const translated = await this.i18n.translateToEnglishIfNeeded(prepared);
        english =
          typeof translated === "string"
            ? translated
            : translated.text || prepared;
      } catch (err) {
        // Translation failed — use original text
        english = prepared;
      }
    }

    // Restore preserved terms in English text
    if (this.termPreservator && termsMap) {
      try {
        english = this.termPreservator.restore(english, termsMap);
      } catch {
        /* ignore */
      }
    }

    return {
      english,
      original: inputText,
      language,
      confidence,
      needsConfirmation,
      termsPreserved,
    };
  }

  /**
   * Translate output back to user's language.
   * @param {object} params
   * @param {string} params.text - English output text
   * @param {string} params.language - Target language code
   * @param {boolean} [params.preserveTerms=true] - Preserve technical terms
   * @returns {Promise<object>} { translated, original, language }
   */
  async processOutput({ text, language, preserveTerms = true }) {
    if (!text || typeof text !== "string") {
      return { translated: "", original: "", language };
    }

    // No translation needed for English
    if (language === "en") {
      return { translated: text, original: text, language: "en" };
    }

    let toTranslate = text;
    let termsMap = null;

    // Preserve technical terms before translation
    if (preserveTerms && this.termPreservator) {
      try {
        const preserved = this.termPreservator.protect(text);
        toTranslate = preserved.text || preserved.processed || text;
        termsMap = preserved.map || preserved.terms || null;
      } catch {
        /* ignore */
      }
    }

    // Translate from English
    let translated = toTranslate;
    if (this.i18n) {
      try {
        const result = await this.i18n.translateFromEnglishIfNeeded(
          toTranslate,
          language,
        );
        translated =
          typeof result === "string" ? result : result.text || toTranslate;
      } catch {
        translated = toTranslate; // Return English if translation fails
      }
    }

    // Restore technical terms
    if (this.termPreservator && termsMap) {
      try {
        translated = this.termPreservator.restore(translated, termsMap);
      } catch {
        /* ignore */
      }
    }

    return {
      translated,
      original: text,
      language,
    };
  }

  /**
   * Generate voice output in user's language.
   * @param {string} text - Text to speak (already translated)
   * @param {string} language - Language code
   * @returns {Promise<object>} { audioPath, language, duration }
   */
  async generateVoiceOutput(text, language) {
    if (!this.i18n) {
      throw new Error("TTS not available — no i18n orchestrator configured");
    }

    try {
      const result = await this.i18n.tts(text, language);
      return {
        audioPath:
          typeof result === "string" ? result : result.audioPath || result.path,
        language,
        duration: result.duration || null,
      };
    } catch (err) {
      throw new Error(`Text-to-speech failed: ${err.message}`);
    }
  }

  /**
   * Get supported languages for compute.
   */
  getSupportedLanguages() {
    return [
      { code: "en", name: "English", script: "Latin" },
      { code: "hi", name: "हिन्दी (Hindi)", script: "Devanagari" },
      { code: "bn", name: "বাংলা (Bengali)", script: "Bengali" },
      { code: "ta", name: "தமிழ் (Tamil)", script: "Tamil" },
      { code: "te", name: "తెలుగు (Telugu)", script: "Telugu" },
      { code: "kn", name: "ಕನ್ನಡ (Kannada)", script: "Kannada" },
      { code: "ml", name: "മലയാളം (Malayalam)", script: "Malayalam" },
      { code: "mr", name: "मराठी (Marathi)", script: "Devanagari" },
      { code: "gu", name: "ગુજરાતી (Gujarati)", script: "Gujarati" },
      { code: "pa", name: "ਪੰਜਾਬੀ (Punjabi)", script: "Gurmukhi" },
      { code: "or", name: "ଓଡ଼ିଆ (Odia)", script: "Odia" },
      { code: "as", name: "অসমীয়া (Assamese)", script: "Bengali" },
      { code: "ur", name: "اردو (Urdu)", script: "Arabic" },
      { code: "es", name: "Español", script: "Latin" },
      { code: "fr", name: "Français", script: "Latin" },
      { code: "de", name: "Deutsch", script: "Latin" },
      { code: "zh", name: "中文", script: "CJK" },
      { code: "ja", name: "日本語", script: "CJK" },
      { code: "ko", name: "한국어", script: "Hangul" },
    ];
  }

  /**
   * Check if multilingual features are available.
   */
  getCapabilities() {
    return {
      languageDetection: !!this.detector,
      translation: !!this.i18n,
      stt: !!this.i18n,
      tts: !!this.i18n,
      termPreservation: !!this.termPreservator,
      supportedLanguages: this.getSupportedLanguages().map((l) => l.code),
    };
  }
}

module.exports = {
  ComputeMultilingualAdapter,
};
