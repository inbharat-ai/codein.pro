const { LANGUAGE_CONFIG, MIXED_SCRIPT_PATTERNS } = require("./language-config");

/**
 * @class LanguageDetector
 * @description Detects script and language from Unicode patterns with support for mixed-script text
 * @example
 * const detector = new LanguageDetector();
 * const result = detector.detectLanguage('नमस्ते');
 * console.log(result); // { language: 'hi', confidence: 0.95 }
 */
class LanguageDetector {
  constructor() {
    this.detectionCache = new Map();
    this.maxCacheSize = 1000;
  }

  /**
   * Detect script from text using Unicode ranges
   * @param {string} text - Text to analyze
   * @returns {Object} Detection result with script and confidence
   */
  detectScript(text) {
    if (!text || typeof text !== "string") {
      return { script: null, confidence: 0, detectedChars: 0 };
    }

    const scriptCounts = {};
    const patterns = [];

    for (const char of text) {
      const code = char.charCodeAt(0);

      for (const [langCode, config] of Object.entries(LANGUAGE_CONFIG)) {
        if (code >= config.unicodeStart && code <= config.unicodeEnd) {
          const script = config.script;
          scriptCounts[script] = (scriptCounts[script] || 0) + 1;
          break;
        }
      }
    }

    if (Object.keys(scriptCounts).length === 0) {
      return { script: "Latin", confidence: 0.5, detectedChars: 0 };
    }

    const total = Object.values(scriptCounts).reduce((a, b) => a + b, 0);
    const primaryScript = Object.entries(scriptCounts).sort(
      ([, a], [, b]) => b - a,
    )[0];
    const confidence = primaryScript[1] / total;

    return {
      script: primaryScript[0],
      confidence: Math.round(confidence * 100) / 100,
      detectedChars: total,
      breakdown: scriptCounts,
    };
  }

  /**
   * Detect language from text
   * @param {string} text - Text to analyze
   * @param {Object} options - Detection options
   * @returns {Object} Detection result with language code and confidence
   */
  detectLanguage(text, options = {}) {
    if (!text || typeof text !== "string") {
      return { language: null, confidence: 0, script: null };
    }

    const cacheKey = `lang:${text.substring(0, 50)}`;
    if (this.detectionCache.has(cacheKey)) {
      return this.detectionCache.get(cacheKey);
    }

    const scriptResult = this.detectScript(text);
    const possibleLanguages = Object.entries(LANGUAGE_CONFIG)
      .filter(([, config]) => config.script === scriptResult.script)
      .map(([code]) => code);

    let detectedLanguage = possibleLanguages[0] || "en";
    let confidence = scriptResult.confidence;

    const specialPatterns = {
      hi: /[\u0900-\u097F]{5,}/g,
      ta: /[\u0B80-\u0BFF]{5,}/g,
      te: /[\u0C60-\u0C7F]{5,}/g,
      kn: /[\u0C80-\u0CFF]{5,}/g,
      ml: /[\u0D00-\u0D7F]{5,}/g,
      bn: /[\u0980-\u09FF]{5,}/g,
      gu: /[\u0A80-\u0AFF]{5,}/g,
      pa: /[\u0A00-\u0A7F]{5,}/g,
      ur: /[\u0600-\u06FF]{5,}/g,
    };

    for (const [lang, pattern] of Object.entries(specialPatterns)) {
      if (text.match(pattern)) {
        detectedLanguage = lang;
        confidence = Math.min(confidence + 0.2, 1.0);
        break;
      }
    }

    const result = {
      language: detectedLanguage,
      code: detectedLanguage,
      confidence: Math.round(confidence * 100) / 100,
      script: scriptResult.script,
      possibleLanguages: possibleLanguages,
    };

    if (this.detectionCache.size >= this.maxCacheSize) {
      const firstKey = this.detectionCache.keys().next().value;
      this.detectionCache.delete(firstKey);
    }

    this.detectionCache.set(cacheKey, result);
    return result;
  }

  /**
   * Detect mixed-language composition (e.g., Hinglish)
   * @param {string} text - Text to analyze
   * @returns {Object} Detection result with mixed language info
   */
  detectMixedLanguage(text) {
    if (!text || typeof text !== "string") {
      return { isMixed: false, languages: [], compositions: [] };
    }

    const languages = new Set();
    const compositions = [];
    let lastScript = null;

    for (const pattern of Object.values(MIXED_SCRIPT_PATTERNS)) {
      if (pattern.pattern.test(text)) {
        compositions.push({
          type: pattern.name,
          primary: pattern.primaryScript,
          secondary: pattern.secondaryScript,
          languages: pattern.languages,
        });

        pattern.languages.forEach((lang) => languages.add(lang));
      }
    }

    const chars = text.split("");
    const languageSequence = [];

    for (const char of chars) {
      const detected = this.detectLanguage(char);
      if (detected.language !== lastScript) {
        languageSequence.push(detected.language);
        lastScript = detected.language;
      }
    }

    return {
      isMixed: languages.size > 1,
      languages: Array.from(languages),
      compositions,
      sequence: languageSequence,
      confidence: compositions.length > 0 ? 0.95 : 0,
    };
  }

  /**
   * Batch detect languages for multiple texts
   * @param {string[]} texts - Array of texts
   * @param {Object} options - Detection options
   * @returns {Object[]} Array of detection results
   */
  batchDetectLanguages(texts, options = {}) {
    if (!Array.isArray(texts)) {
      return [];
    }

    return texts.map((text, index) => ({
      index,
      text: text.substring(0, 100),
      ...this.detectLanguage(text, options),
    }));
  }

  /**
   * Get comprehensive detection report
   * @param {string} text - Text to analyze
   * @returns {Object} Comprehensive analysis report
   */
  getDetectionReport(text) {
    const scriptResult = this.detectScript(text);
    const languageResult = this.detectLanguage(text);
    const mixedResult = this.detectMixedLanguage(text);

    const langConfig = LANGUAGE_CONFIG[languageResult.language];

    return {
      text: text.substring(0, 200),
      length: text.length,
      script: {
        name: scriptResult.script,
        confidence: scriptResult.confidence,
        detectedChars: scriptResult.detectedChars,
        breakdown: scriptResult.breakdown,
      },
      language: {
        code: languageResult.language,
        name: langConfig?.englishName || "Unknown",
        nativeName: langConfig?.nativeName || "Unknown",
        confidence: languageResult.confidence,
        possibleLanguages: languageResult.possibleLanguages,
      },
      mixed: mixedResult,
      metadata: langConfig
        ? {
            speakers: langConfig.speakers,
            region: langConfig.region,
            rtl: langConfig.rtl,
            technicalSupport: langConfig.technicalTermSupport,
          }
        : null,
    };
  }

  /**
   * Check if text contains specific language
   * @param {string} text - Text to check
   * @param {string} langCode - Language code
   * @returns {boolean} True if text appears to be in language
   */
  isLanguage(text, langCode) {
    const result = this.detectLanguage(text);
    return result.language === langCode && result.confidence >= 0.7;
  }

  /**
   * Check if language is supported
   * @param {string} langCode - Language code
   * @returns {boolean} True if language is supported
   */
  isSupportedLanguage(langCode) {
    return langCode in LANGUAGE_CONFIG;
  }

  /**
   * Get all supported language codes
   * @returns {string[]} Array of supported language codes
   */
  getSupportedLanguages() {
    return Object.keys(LANGUAGE_CONFIG);
  }

  /**
   * Clear detection cache
   */
  clearCache() {
    this.detectionCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.detectionCache.size,
      maxSize: this.maxCacheSize,
      utilization:
        Math.round((this.detectionCache.size / this.maxCacheSize) * 100) + "%",
    };
  }
}

module.exports = { LanguageDetector };
