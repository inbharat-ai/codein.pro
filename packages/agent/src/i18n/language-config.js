/**
 * @fileoverview Language configuration for 18 Indian languages with multilingual support
 * Supports: Hindi, Bengali, Tamil, Telugu, Kannada, Malayalam, Marathi, Gujarati,
 * Punjabi, Odia, Assamese, Urdu, Sindhi, Konkani, Manipuri, Dogri, Bodo, Santali
 */

const LANGUAGE_CONFIG = {
  // Major Indian Languages
  hi: {
    name: "हिन्दी",
    englishName: "Hindi",
    nativeName: "हिन्दी",
    script: "Devanagari",
    direction: "ltr",
    rtl: false,
    phoneticCode: "hi-IN",
    region: "India",
    speakers: "345M+",
    technicalTermSupport: true,
    unicodeStart: 0x0900,
    unicodeEnd: 0x097f,
  },
  bn: {
    name: "বাংলা",
    englishName: "Bengali",
    nativeName: "বাংলা",
    script: "Bengali",
    direction: "ltr",
    rtl: false,
    phoneticCode: "bn-IN",
    region: "India",
    speakers: "265M+",
    technicalTermSupport: true,
    unicodeStart: 0x0980,
    unicodeEnd: 0x09ff,
  },
  ta: {
    name: "தமிழ்",
    englishName: "Tamil",
    nativeName: "தமிழ்",
    script: "Tamil",
    direction: "ltr",
    rtl: false,
    phoneticCode: "ta-IN",
    region: "India",
    speakers: "75M+",
    technicalTermSupport: true,
    unicodeStart: 0x0b80,
    unicodeEnd: 0x0bff,
  },
  te: {
    name: "తెలుగు",
    englishName: "Telugu",
    nativeName: "తెలుగు",
    script: "Telugu",
    direction: "ltr",
    rtl: false,
    phoneticCode: "te-IN",
    region: "India",
    speakers: "75M+",
    technicalTermSupport: true,
    unicodeStart: 0x0c00,
    unicodeEnd: 0x0c7f,
  },
  kn: {
    name: "ಕನ್ನಡ",
    englishName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    script: "Kannada",
    direction: "ltr",
    rtl: false,
    phoneticCode: "kn-IN",
    region: "India",
    speakers: "44M+",
    technicalTermSupport: true,
    unicodeStart: 0x0c80,
    unicodeEnd: 0x0cff,
  },
  ml: {
    name: "മലയാളം",
    englishName: "Malayalam",
    nativeName: "മലയാളം",
    script: "Malayalam",
    direction: "ltr",
    rtl: false,
    phoneticCode: "ml-IN",
    region: "India",
    speakers: "34M+",
    technicalTermSupport: true,
    unicodeStart: 0x0d00,
    unicodeEnd: 0x0d7f,
  },
  mr: {
    name: "मराठी",
    englishName: "Marathi",
    nativeName: "मराठी",
    script: "Devanagari",
    direction: "ltr",
    rtl: false,
    phoneticCode: "mr-IN",
    region: "India",
    speakers: "83M+",
    technicalTermSupport: true,
    unicodeStart: 0x0900,
    unicodeEnd: 0x097f,
  },
  gu: {
    name: "ગુજરાતી",
    englishName: "Gujarati",
    nativeName: "ગુજરાતી",
    script: "Gujarati",
    direction: "ltr",
    rtl: false,
    phoneticCode: "gu-IN",
    region: "India",
    speakers: "60M+",
    technicalTermSupport: true,
    unicodeStart: 0x0a80,
    unicodeEnd: 0x0aff,
  },
  pa: {
    name: "ਪੰਜਾਬੀ",
    englishName: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
    script: "Gurmukhi",
    direction: "ltr",
    rtl: false,
    phoneticCode: "pa-IN",
    region: "India",
    speakers: "125M+",
    technicalTermSupport: true,
    unicodeStart: 0x0a00,
    unicodeEnd: 0x0a7f,
  },
  or: {
    name: "ଓଡ଼ିଆ",
    englishName: "Odia",
    nativeName: "ଓଡ଼ିଆ",
    script: "Odia",
    direction: "ltr",
    rtl: false,
    phoneticCode: "or-IN",
    region: "India",
    speakers: "46M+",
    technicalTermSupport: true,
    unicodeStart: 0x0b00,
    unicodeEnd: 0x0b7f,
  },
  as: {
    name: "অসমীয়া",
    englishName: "Assamese",
    nativeName: "অসমীয়া",
    script: "Bengali",
    direction: "ltr",
    rtl: false,
    phoneticCode: "as-IN",
    region: "India",
    speakers: "13M+",
    technicalTermSupport: false,
    unicodeStart: 0x0980,
    unicodeEnd: 0x09ff,
  },
  ur: {
    name: "اردو",
    englishName: "Urdu",
    nativeName: "اردو",
    script: "Perso-Arabic",
    direction: "rtl",
    rtl: true,
    phoneticCode: "ur-IN",
    region: "India",
    speakers: "50M+",
    technicalTermSupport: true,
    unicodeStart: 0x0600,
    unicodeEnd: 0x06ff,
  },
  sd: {
    name: "سندھي",
    englishName: "Sindhi",
    nativeName: "سندھي",
    script: "Perso-Arabic",
    direction: "rtl",
    rtl: true,
    phoneticCode: "sd-IN",
    region: "India",
    speakers: "6M+",
    technicalTermSupport: false,
    unicodeStart: 0x0600,
    unicodeEnd: 0x06ff,
  },
  kok: {
    name: "कोंकणी",
    englishName: "Konkani",
    nativeName: "कोंकणी",
    script: "Devanagari",
    direction: "ltr",
    rtl: false,
    phoneticCode: "kok-IN",
    region: "India",
    speakers: "7M+",
    technicalTermSupport: false,
    unicodeStart: 0x0900,
    unicodeEnd: 0x097f,
  },
  mni: {
    name: "মৈতেইলোল",
    englishName: "Manipuri",
    nativeName: "মৈতেইলোল",
    script: "Meitei",
    direction: "ltr",
    rtl: false,
    phoneticCode: "mni-IN",
    region: "India",
    speakers: "1.8M+",
    technicalTermSupport: false,
    unicodeStart: 0xaae0,
    unicodeEnd: 0xaaff,
  },
  doi: {
    name: "डोगरी",
    englishName: "Dogri",
    nativeName: "डोगरी",
    script: "Devanagari",
    direction: "ltr",
    rtl: false,
    phoneticCode: "doi-IN",
    region: "India",
    speakers: "2.3M+",
    technicalTermSupport: false,
    unicodeStart: 0x0900,
    unicodeEnd: 0x097f,
  },
  brx: {
    name: "बड़ो",
    englishName: "Bodo",
    nativeName: "बड़ो",
    script: "Devanagari",
    direction: "ltr",
    rtl: false,
    phoneticCode: "brx-IN",
    region: "India",
    speakers: "1.5M+",
    technicalTermSupport: false,
    unicodeStart: 0x0900,
    unicodeEnd: 0x097f,
  },
  sat: {
    name: "संताली",
    englishName: "Santali",
    nativeName: "संताली",
    script: "Ol Chiki",
    direction: "ltr",
    rtl: false,
    phoneticCode: "sat-IN",
    region: "India",
    speakers: "7M+",
    technicalTermSupport: false,
    unicodeStart: 0x1c50,
    unicodeEnd: 0x1c7f,
  },
  en: {
    name: "English",
    englishName: "English",
    nativeName: "English",
    script: "Latin",
    direction: "ltr",
    rtl: false,
    phoneticCode: "en-IN",
    region: "International",
    speakers: "1.5B+",
    technicalTermSupport: true,
    unicodeStart: 0x0000,
    unicodeEnd: 0x007f,
  },
};

const MIXED_SCRIPT_PATTERNS = {
  hinglish: {
    name: "Hinglish",
    pattern: /[\u0900-\u097F][a-zA-Z0-9\u0900-\u097F]*[a-zA-Z0-9]+/g,
    primaryScript: "Devanagari",
    secondaryScript: "Latin",
    languages: ["hi", "en"],
  },
  tanglish: {
    name: "Tanglish",
    pattern: /[\u0B80-\u0BFF][a-zA-Z0-9\u0B80-\u0BFF]*[a-zA-Z0-9]+/g,
    primaryScript: "Tamil",
    secondaryScript: "Latin",
    languages: ["ta", "en"],
  },
  telunglish: {
    name: "Telunglish",
    pattern: /[\u0C60-\u0C7F][a-zA-Z0-9\u0C60-\u0C7F]*[a-zA-Z0-9]+/g,
    primaryScript: "Telugu",
    secondaryScript: "Latin",
    languages: ["te", "en"],
  },
  kanglish: {
    name: "Kanglish",
    pattern: /[\u0C80-\u0CFF][a-zA-Z0-9\u0C80-\u0CFF]*[a-zA-Z0-9]+/g,
    primaryScript: "Kannada",
    secondaryScript: "Latin",
    languages: ["kn", "en"],
  },
  malyalam: {
    name: "Manglish",
    pattern: /[\u0D00-\u0D7F][a-zA-Z0-9\u0D00-\u0D7F]*[a-zA-Z0-9]+/g,
    primaryScript: "Malayalam",
    secondaryScript: "Latin",
    languages: ["ml", "en"],
  },
  bengali_english: {
    name: "Benglish",
    pattern: /[\u0980-\u09FF][a-zA-Z0-9\u0980-\u09FF]*[a-zA-Z0-9]+/g,
    primaryScript: "Bengali",
    secondaryScript: "Latin",
    languages: ["bn", "en"],
  },
  gujarati_english: {
    name: "Gujarlish",
    pattern: /[\u0A80-\u0AFF][a-zA-Z0-9\u0A80-\u0AFF]*[a-zA-Z0-9]+/g,
    primaryScript: "Gujarati",
    secondaryScript: "Latin",
    languages: ["gu", "en"],
  },
  punjabi_english: {
    name: "Punglish",
    pattern: /[\u0A00-\u0A7F][a-zA-Z0-9\u0A00-\u0A7F]*[a-zA-Z0-9]+/g,
    primaryScript: "Gurmukhi",
    secondaryScript: "Latin",
    languages: ["pa", "en"],
  },
};

/**
 * Get language configuration by code
 * @param {string} langCode - Language code (e.g., 'hi', 'ta', 'en')
 * @returns {Object|null} Language config or null if not found
 */
function getLanguageConfig(langCode) {
  return LANGUAGE_CONFIG[langCode] || null;
}

/**
 * Get all supported language codes
 * @returns {string[]} Array of language codes
 */
function getAllLanguageCodes() {
  return Object.keys(LANGUAGE_CONFIG);
}

/**
 * Get all supported languages with metadata
 * @returns {Object[]} Array of language objects
 */
function getAllLanguages() {
  return Object.entries(LANGUAGE_CONFIG).map(([code, config]) => ({
    code,
    ...config,
  }));
}

/**
 * Check if language supports technical terminology
 * @param {string} langCode - Language code
 * @returns {boolean} True if language has tech term support
 */
function supportsTechnicalTerms(langCode) {
  const config = getLanguageConfig(langCode);
  return config ? config.technicalTermSupport : false;
}

/**
 * Get script for language
 * @param {string} langCode - Language code
 * @returns {string|null} Script name or null
 */
function getLanguageScript(langCode) {
  const config = getLanguageConfig(langCode);
  return config ? config.script : null;
}

/**
 * Check if language is RTL
 * @param {string} langCode - Language code
 * @returns {boolean} True if RTL
 */
function isRTL(langCode) {
  const config = getLanguageConfig(langCode);
  return config ? config.rtl : false;
}

/**
 * Get related languages for translation
 * @param {string} langCode - Language code
 * @returns {Object} Object with routes to related languages
 */
function getRelatedLanguages(langCode) {
  const config = getLanguageConfig(langCode);
  if (!config) return {};

  const script = config.script;
  const sameScriptLangs = Object.entries(LANGUAGE_CONFIG)
    .filter(([code, cfg]) => cfg.script === script && code !== langCode)
    .map(([code]) => code);

  return {
    sameScript: sameScriptLangs,
    toEnglish: langCode !== "en" ? "en" : null,
    fromEnglish: langCode !== "en" ? "en" : null,
    devanagariBased:
      script === "Devanagari"
        ? ["hi", "mr", "ko k", "doi", "brx"].filter((c) => c !== langCode)
        : [],
  };
}

module.exports = {
  LANGUAGE_CONFIG,
  MIXED_SCRIPT_PATTERNS,
  getLanguageConfig,
  getAllLanguageCodes,
  getAllLanguages,
  supportsTechnicalTerms,
  getLanguageScript,
  isRTL,
  getRelatedLanguages,
};
