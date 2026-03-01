/**
 * Multilingual Hardening Module
 *
 * Builds on existing LanguageDetector + I18nOrchestrator to add:
 *   1. Confidence-based language detection with threshold
 *   2. Ambiguity detection & resolution (multi-script prompts, Hinglish, etc.)
 *   3. Technical term density analysis for mixed-language prompts
 *   4. Language intent confirmation signals
 *   5. Per-language quality validation
 *
 * Designed to harden multilingual TTS/STT for 18+ Indian languages.
 */

const AMBIGUITY_THRESHOLD = 0.65; // Below this → ambiguous
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

// Common code-switching patterns (e.g., Hinglish, Tanglish)
const CODE_SWITCHING_PATTERNS = {
  "hi-en": {
    name: "Hinglish",
    indicators: [
      /\b(karo|kya|hai|nahi|mein|aur|ka|ke|ki|ko|se|par|ye|wo|toh|bhi|lekin)\b/i,
      /\b(please|thanks|ok|sorry|yes|no|but|and|or|the|is|was)\b/i,
    ],
    primary: "hi",
    secondary: "en",
  },
  "ta-en": {
    name: "Tanglish",
    indicators: [
      /\b(pannungal?|enna|illa|irukku|vandha|poga|sollu|theriyum)\b/i,
    ],
    primary: "ta",
    secondary: "en",
  },
  "bn-en": {
    name: "Benglish",
    indicators: [/\b(korbo|koro|ache|nai|holo|bolo|jao|eso)\b/i],
    primary: "bn",
    secondary: "en",
  },
  "te-en": {
    name: "Tenglish",
    indicators: [/\b(cheyandi|emiti|undi|ledu|vachindi|cheppandi)\b/i],
    primary: "te",
    secondary: "en",
  },
};

// Language-specific quality validation rules
const LANGUAGE_VALIDATORS = {
  hi: {
    // Hindi: must contain Devanagari characters or known romanized patterns
    hasNativeScript: (text) => /[\u0900-\u097F]/.test(text),
    minConfidence: 0.6,
    commonErrors: ["Unicode rendering", "Devanagari joiner issues"],
  },
  bn: {
    hasNativeScript: (text) => /[\u0980-\u09FF]/.test(text),
    minConfidence: 0.6,
    commonErrors: ["Bengali vs Assamese script overlap"],
  },
  ta: {
    hasNativeScript: (text) => /[\u0B80-\u0BFF]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Tamil Unicode normalization"],
  },
  te: {
    hasNativeScript: (text) => /[\u0C00-\u0C7F]/.test(text),
    minConfidence: 0.6,
    commonErrors: ["Telugu vs Kannada script similarity"],
  },
  kn: {
    hasNativeScript: (text) => /[\u0C80-\u0CFF]/.test(text),
    minConfidence: 0.6,
    commonErrors: ["Kannada vs Telugu script similarity"],
  },
  ml: {
    hasNativeScript: (text) => /[\u0D00-\u0D7F]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Malayalam chillu letters"],
  },
  mr: {
    hasNativeScript: (text) => /[\u0900-\u097F]/.test(text),
    minConfidence: 0.55, // Lower because shares Devanagari with Hindi
    commonErrors: ["Hindi vs Marathi Devanagari distinction"],
  },
  gu: {
    hasNativeScript: (text) => /[\u0A80-\u0AFF]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Gujarati script rendering"],
  },
  pa: {
    hasNativeScript: (text) => /[\u0A00-\u0A7F]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Gurmukhi vs Shahmukhi"],
  },
  or: {
    hasNativeScript: (text) => /[\u0B00-\u0B7F]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Odia script rendering"],
  },
  as: {
    hasNativeScript: (text) => /[\u0980-\u09FF]/.test(text),
    minConfidence: 0.5, // Lower because shares script with Bengali
    commonErrors: ["Bengali vs Assamese distinction"],
  },
  ur: {
    hasNativeScript: (text) => /[\u0600-\u06FF]/.test(text),
    minConfidence: 0.65,
    commonErrors: ["Urdu RTL rendering", "Nastaliq vs Naskh"],
  },
  en: {
    hasNativeScript: (text) => /[a-zA-Z]/.test(text),
    minConfidence: 0.7,
    commonErrors: [],
  },
};

class MultilingualHardener {
  constructor(options = {}) {
    this.ambiguityThreshold = options.ambiguityThreshold ?? AMBIGUITY_THRESHOLD;
    this.highConfidenceThreshold =
      options.highConfidenceThreshold ?? HIGH_CONFIDENCE_THRESHOLD;
    this.stats = {
      detections: 0,
      ambiguous: 0,
      codeSwitching: 0,
      highConfidence: 0,
      byLanguage: {},
    };
  }

  /**
   * Enhanced language detection with confidence levels.
   *
   * @param {string} text - Input text
   * @param {Object} context - { expectedLanguage, userPreference, previousLanguage }
   * @returns {{ language: string, confidence: number, level: string, ambiguous: boolean, alternatives: Array, codeSwitching: Object|null, signals: string[] }}
   */
  detectWithConfidence(text, context = {}) {
    this.stats.detections++;
    const signals = [];

    if (!text || text.trim().length === 0) {
      return this._emptyResult(context);
    }

    // 1. Script-level detection
    const scriptAnalysis = this._analyzeScripts(text);

    // 2. Check for code-switching (Hinglish, Tanglish, etc.)
    const codeSwitching = this._detectCodeSwitching(text);
    if (codeSwitching) {
      this.stats.codeSwitching++;
      signals.push(`code-switching: ${codeSwitching.name}`);
    }

    // 3. Technical content detection (code in prompt?)
    const technicalRatio = this._estimateTechnicalContent(text);
    if (technicalRatio > 0.5) {
      signals.push(`high-technical: ${(technicalRatio * 100).toFixed(0)}%`);
    }

    // 4. Determine primary language
    let language = scriptAnalysis.primary;
    let confidence = scriptAnalysis.confidence;

    // Boost/reduce confidence based on context
    if (context.expectedLanguage && language === context.expectedLanguage) {
      confidence = Math.min(1, confidence + 0.1);
      signals.push("matches-expected");
    }
    if (context.previousLanguage && language === context.previousLanguage) {
      confidence = Math.min(1, confidence + 0.05);
      signals.push("matches-previous");
    }

    // Handle mixed-script (e.g., Hindi + English)
    if (scriptAnalysis.scripts.length > 1) {
      confidence *= 0.85; // Lower confidence for mixed
      signals.push(`mixed-scripts: ${scriptAnalysis.scripts.join("+")}`);
    }

    // If mostly technical/code content, default to English
    if (technicalRatio > 0.7 && confidence < 0.6) {
      language = "en";
      confidence = 0.75;
      signals.push("defaulted-to-en-technical");
    }

    // Classify confidence level
    const level =
      confidence >= this.highConfidenceThreshold
        ? "high"
        : confidence >= this.ambiguityThreshold
          ? "medium"
          : "low";

    const ambiguous = confidence < this.ambiguityThreshold;
    if (ambiguous) this.stats.ambiguous++;
    if (level === "high") this.stats.highConfidence++;

    // Track per-language stats
    this.stats.byLanguage[language] =
      (this.stats.byLanguage[language] || 0) + 1;

    return {
      language,
      confidence: Math.round(confidence * 100) / 100,
      level,
      ambiguous,
      alternatives: scriptAnalysis.alternatives || [],
      codeSwitching,
      signals,
      scriptBreakdown: scriptAnalysis.breakdown,
    };
  }

  /**
   * Resolve ambiguous language detection.
   * Returns a confirmation prompt if needed, or the best guess.
   *
   * @param {Object} detection - Output from detectWithConfidence
   * @param {Object} options - { autoResolve, userPreference }
   * @returns {{ resolved: boolean, language: string, confirmationNeeded: boolean, confirmationPrompt?: string }}
   */
  resolveAmbiguity(detection, options = {}) {
    if (!detection.ambiguous) {
      return {
        resolved: true,
        language: detection.language,
        confirmationNeeded: false,
      };
    }

    // Auto-resolve if user has a preference
    if (options.userPreference) {
      return {
        resolved: true,
        language: options.userPreference,
        confirmationNeeded: false,
        resolvedBy: "user-preference",
      };
    }

    // Auto-resolve code-switching to primary language
    if (detection.codeSwitching) {
      return {
        resolved: true,
        language: detection.codeSwitching.primary,
        confirmationNeeded: false,
        resolvedBy: "code-switching-primary",
      };
    }

    // Auto-resolve if we have alternatives
    if (options.autoResolve && detection.alternatives.length > 0) {
      return {
        resolved: true,
        language: detection.alternatives[0].language,
        confirmationNeeded: false,
        resolvedBy: "best-alternative",
      };
    }

    // Need user confirmation
    const altNames = detection.alternatives
      .slice(0, 3)
      .map((a) => a.name || a.language);
    const prompt =
      altNames.length > 0
        ? `I detected your input might be in ${detection.language} or ${altNames.join("/")}. Which language would you like me to use?`
        : `I'm not sure which language your input is in (detected: ${detection.language} with ${(detection.confidence * 100).toFixed(0)}% confidence). Could you confirm?`;

    return {
      resolved: false,
      language: detection.language,
      confirmationNeeded: true,
      confirmationPrompt: prompt,
      alternatives: detection.alternatives.slice(0, 4),
    };
  }

  /**
   * Validate output quality for a specific language.
   *
   * @param {string} text - Generated/translated text
   * @param {string} targetLang - Expected language
   * @returns {{ valid: boolean, confidence: number, issues: string[] }}
   */
  validateLanguageOutput(text, targetLang) {
    const validator = LANGUAGE_VALIDATORS[targetLang];
    if (!validator) {
      return {
        valid: true,
        confidence: 0.5,
        issues: ["No validator for " + targetLang],
      };
    }

    const issues = [];
    let confidence = 0.8;

    // Check if output contains expected script
    if (targetLang !== "en" && !validator.hasNativeScript(text)) {
      issues.push(`Expected ${targetLang} script not found in output`);
      confidence -= 0.3;
    }

    // Check for common encoding issues
    if (/\uFFFD/.test(text)) {
      issues.push("Unicode replacement characters found (encoding error)");
      confidence -= 0.2;
    }

    // Check for excessive Latin characters in non-English output
    if (targetLang !== "en") {
      const latinRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
      if (latinRatio > 0.5) {
        issues.push(
          `High Latin character ratio (${(latinRatio * 100).toFixed(0)}%) in ${targetLang} output`,
        );
        confidence -= 0.15;
      }
    }

    // Check minimum length
    if (text.trim().length < 5) {
      issues.push("Output too short");
      confidence -= 0.2;
    }

    return {
      valid: confidence >= validator.minConfidence,
      confidence: Math.max(0, Math.round(confidence * 100) / 100),
      issues,
      knownIssues: validator.commonErrors,
    };
  }

  // ── Internal Methods ──────────────────────────────────────────────────

  _analyzeScripts(text) {
    const scriptRanges = {
      devanagari: { range: [0x0900, 0x097f], langs: ["hi", "mr", "sa"] },
      bengali: { range: [0x0980, 0x09ff], langs: ["bn", "as"] },
      gurmukhi: { range: [0x0a00, 0x0a7f], langs: ["pa"] },
      gujarati: { range: [0x0a80, 0x0aff], langs: ["gu"] },
      oriya: { range: [0x0b00, 0x0b7f], langs: ["or"] },
      tamil: { range: [0x0b80, 0x0bff], langs: ["ta"] },
      telugu: { range: [0x0c00, 0x0c7f], langs: ["te"] },
      kannada: { range: [0x0c80, 0x0cff], langs: ["kn"] },
      malayalam: { range: [0x0d00, 0x0d7f], langs: ["ml"] },
      arabic: { range: [0x0600, 0x06ff], langs: ["ur", "ar"] },
      latin: { range: [0x0041, 0x007a], langs: ["en"] },
    };

    const counts = {};
    let total = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code <= 0x20) continue; // skip whitespace

      for (const [scriptName, { range }] of Object.entries(scriptRanges)) {
        if (code >= range[0] && code <= range[1]) {
          counts[scriptName] = (counts[scriptName] || 0) + 1;
          total++;
          break;
        }
      }
    }

    if (total === 0) {
      return {
        primary: "en",
        confidence: 0.5,
        scripts: ["latin"],
        breakdown: {},
        alternatives: [],
      };
    }

    // Sort scripts by count
    const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const primaryScript = sorted[0][0];
    const primaryCount = sorted[0][1];
    const confidence = primaryCount / total;

    const primaryLangs = scriptRanges[primaryScript]?.langs || ["en"];
    const primary = primaryLangs[0];

    const alternatives = sorted.slice(1).flatMap(([script, count]) => {
      const langs = scriptRanges[script]?.langs || [];
      return langs.map((lang) => ({
        language: lang,
        name: lang,
        script,
        ratio: Math.round((count / total) * 100) / 100,
      }));
    });

    // Also include same-script alternatives (e.g., Hindi vs Marathi for Devanagari)
    if (primaryLangs.length > 1) {
      for (const altLang of primaryLangs.slice(1)) {
        alternatives.unshift({
          language: altLang,
          name: altLang,
          script: primaryScript,
          ratio: confidence,
          note: "same-script",
        });
      }
    }

    return {
      primary,
      confidence,
      scripts: sorted.map(([s]) => s),
      breakdown: Object.fromEntries(
        sorted.map(([s, c]) => [s, Math.round((c / total) * 100) / 100]),
      ),
      alternatives,
    };
  }

  _detectCodeSwitching(text) {
    for (const [, pattern] of Object.entries(CODE_SWITCHING_PATTERNS)) {
      let matchCount = 0;
      for (const indicator of pattern.indicators) {
        if (indicator.test(text)) matchCount++;
      }
      if (matchCount >= 1) {
        return {
          name: pattern.name,
          primary: pattern.primary,
          secondary: pattern.secondary,
          confidence: Math.min(1, matchCount * 0.4),
        };
      }
    }
    return null;
  }

  _estimateTechnicalContent(text) {
    // Count technical patterns vs natural language
    const codePatterns = [
      /[{}()\[\];=><]+/g,
      /\b(function|const|let|var|class|import|export|return|if|else|for|while)\b/g,
      /\b(def|print|self|None|True|False)\b/g,
      /[a-zA-Z]+\.[a-zA-Z]+\(/g, // method calls
      /\/\/.*|#.*/g, // comments
    ];

    let technicalChars = 0;
    for (const pattern of codePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        technicalChars += matches.join("").length;
      }
    }

    return text.length > 0 ? technicalChars / text.length : 0;
  }

  _emptyResult(context) {
    return {
      language: context.expectedLanguage || context.previousLanguage || "en",
      confidence: 0,
      level: "low",
      ambiguous: true,
      alternatives: [],
      codeSwitching: null,
      signals: ["empty-input"],
    };
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = {
      detections: 0,
      ambiguous: 0,
      codeSwitching: 0,
      highConfidence: 0,
      byLanguage: {},
    };
  }
}

module.exports = {
  MultilingualHardener,
  CODE_SWITCHING_PATTERNS,
  LANGUAGE_VALIDATORS,
  AMBIGUITY_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
};
