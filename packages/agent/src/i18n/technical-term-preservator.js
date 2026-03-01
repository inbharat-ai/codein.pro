/**
 * @fileoverview Technical Term Preservator
 * Protects programming keywords, code snippets, identifiers, and technical terms
 * from being mangled during translation. Uses placeholder injection before translation
 * and restoration after translation.
 *
 * Strategy:
 * 1. Pre-translation: Extract code blocks, identifiers, technical terms → replace with safe placeholders
 * 2. Translation: Machine/LLM translates natural language only
 * 3. Post-translation: Restore original technical terms from placeholders
 */

const fs = require("fs");
const path = require("path");

// Load glossary
let GLOSSARY = {};
try {
  const glossaryPath = path.join(__dirname, "terminology-glossary.json");
  GLOSSARY = JSON.parse(fs.readFileSync(glossaryPath, "utf8"));
} catch (err) {
  console.warn("[TermPreservator] Failed to load glossary:", err.message);
}

/**
 * Patterns that identify technical content which MUST NOT be translated
 */
const CODE_PATTERNS = [
  // Inline code blocks: `code here`
  { pattern: /`[^`]+`/g, type: "inline-code" },
  // Fenced code blocks: ```...```
  { pattern: /```[\s\S]*?```/g, type: "code-block" },
  // File paths: /foo/bar.js, ./src/index.ts, C:\Users\file.py
  { pattern: /(?:[A-Z]:)?(?:\/|\\)[\w.\-/\\]+\.\w{1,10}/g, type: "file-path" },
  // URLs
  { pattern: /https?:\/\/[^\s)>\]]+/g, type: "url" },
  // Import/require statements
  { pattern: /(?:import|require|from)\s+['"][^'"]+['"]/g, type: "import" },
  // Dotted identifiers: fs.readFileSync, console.log, process.env
  {
    pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\b/g,
    type: "dotted-identifier",
  },
  // CamelCase identifiers: myFunction, handleClick, useState
  { pattern: /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g, type: "camel-case" },
  // PascalCase identifiers: MyComponent, ReactNode, EventHandler
  { pattern: /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, type: "pascal-case" },
  // UPPER_SNAKE_CASE constants: MAX_RETRIES, API_KEY, NODE_ENV
  { pattern: /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, type: "constant" },
  // snake_case identifiers: my_function, get_data, set_value
  { pattern: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, type: "snake-case" },
  // Type annotations: string[], number | undefined, Promise<T>
  {
    pattern:
      /\b(?:string|number|boolean|void|null|undefined|any|never|unknown)\s*(?:\[\]|\||\<)/g,
    type: "type-annotation",
  },
  // Arrow functions: () => {}, (x) => x
  { pattern: /\([^)]*\)\s*=>\s*/g, type: "arrow-function" },
  // Template literals: ${expression}
  { pattern: /\$\{[^}]+\}/g, type: "template-literal" },
  // Command-line flags: --verbose, -f, --output-dir
  { pattern: /\s--?[a-zA-Z][\w-]*/g, type: "cli-flag" },
  // Package names: @scope/package, lodash, react-dom
  {
    pattern: /@[\w-]+\/[\w.-]+|(?<=\s|^)[\w][\w.-]*(?:\/[\w.-]+)/g,
    type: "package-name",
  },
  // Version strings: v1.2.3, 3.0.0-beta.1
  { pattern: /\bv?\d+\.\d+\.\d+(?:-[\w.]+)?\b/g, type: "version" },
  // Environment variables: $HOME, %PATH%, process.env.NODE_ENV
  { pattern: /\$[A-Z_]+|%[A-Z_]+%/g, type: "env-var" },
  // Hex colors: #fff, #ff0000
  { pattern: /#[0-9a-fA-F]{3,8}\b/g, type: "hex-color" },
  // Regex literals: /pattern/flags
  { pattern: /\/[^/\n]+\/[gimsuy]*/g, type: "regex" },
];

/**
 * Programming keywords that should be preserved in their English form
 */
const PROGRAMMING_KEYWORDS = new Set([
  // JavaScript/TypeScript
  "const",
  "let",
  "var",
  "function",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "enum",
  "namespace",
  "module",
  "export",
  "import",
  "default",
  "async",
  "await",
  "yield",
  "return",
  "if",
  "else",
  "switch",
  "case",
  "break",
  "continue",
  "for",
  "while",
  "do",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "in",
  "of",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "this",
  "super",
  "static",
  "get",
  "set",
  "constructor",
  "prototype",
  "readonly",
  "abstract",
  "private",
  "protected",
  "public",
  "override",
  // Python
  "def",
  "class",
  "import",
  "from",
  "as",
  "with",
  "assert",
  "pass",
  "raise",
  "except",
  "finally",
  "lambda",
  "nonlocal",
  "global",
  "True",
  "False",
  "None",
  "self",
  "cls",
  "__init__",
  "__main__",
  "elif",
  "yield",
  // Common framework terms
  "useState",
  "useEffect",
  "useRef",
  "useMemo",
  "useCallback",
  "React",
  "Vue",
  "Angular",
  "Node",
  "Express",
  "Django",
  "Flask",
  "npm",
  "yarn",
  "pip",
  "cargo",
  "gradle",
  "maven",
  "git",
  "docker",
  "kubernetes",
  "nginx",
  "redis",
  "postgres",
  "mongodb",
  "mysql",
  "sqlite",
  "elasticsearch",
  "REST",
  "GraphQL",
  "gRPC",
  "WebSocket",
  "HTTP",
  "HTTPS",
  "TCP",
  "UDP",
  "JSON",
  "XML",
  "YAML",
  "TOML",
  "CSV",
  "HTML",
  "CSS",
  "SQL",
  "API",
  "SDK",
  "CLI",
  "GUI",
  "IDE",
  "ORM",
  "MVC",
  "MVVM",
  "OAuth",
  "JWT",
  "CORS",
  "XSS",
  "CSRF",
  "SSL",
  "TLS",
  "CRUD",
  "ACID",
  "BASE",
  "CAP",
  "DRY",
  "SOLID",
  "KISS",
]);

/**
 * @class TechnicalTermPreservator
 * @description Extracts technical terms before translation, restores them after
 */
class TechnicalTermPreservator {
  constructor(options = {}) {
    this.glossary = options.glossary || GLOSSARY;
    this.preserveCodeBlocks = options.preserveCodeBlocks !== false;
    this.preserveIdentifiers = options.preserveIdentifiers !== false;
    this.useGlossaryTranslation = options.useGlossaryTranslation !== false;
    this.placeholderPrefix = "⟦TECH";
    this.placeholderSuffix = "⟧";
    this.stats = { preserved: 0, restored: 0, glossaryHits: 0 };
  }

  /**
   * Pre-process text before translation: extract and replace technical terms with placeholders
   * @param {string} text - Original text (possibly mixed natural language + code)
   * @param {string} sourceLang - Source language code
   * @returns {{ processedText: string, placeholderMap: Map<string, Object> }}
   */
  preProcess(text, sourceLang = "en") {
    if (!text || typeof text !== "string") {
      return { processedText: text, placeholderMap: new Map() };
    }

    const placeholderMap = new Map();
    let processedText = text;
    let placeholderIndex = 0;

    /**
     * Replace a match with a placeholder and store in map
     */
    const replaceWithPlaceholder = (match, type) => {
      const key = `${this.placeholderPrefix}${placeholderIndex}${this.placeholderSuffix}`;
      placeholderMap.set(key, {
        original: match,
        type,
        index: placeholderIndex,
      });
      placeholderIndex++;
      this.stats.preserved++;
      return key;
    };

    // 1. Protect code blocks first (highest priority, may contain other patterns)
    if (this.preserveCodeBlocks) {
      // Fenced code blocks
      processedText = processedText.replace(/```[\s\S]*?```/g, (match) =>
        replaceWithPlaceholder(match, "code-block"),
      );
      // Inline code
      processedText = processedText.replace(/`[^`]+`/g, (match) =>
        replaceWithPlaceholder(match, "inline-code"),
      );
    }

    // 2. Protect URLs and file paths
    processedText = processedText.replace(/https?:\/\/[^\s)>\]]+/g, (match) =>
      replaceWithPlaceholder(match, "url"),
    );
    processedText = processedText.replace(
      /(?:[A-Z]:)?(?:\/|\\)[\w.\-/\\]+\.\w{1,10}/g,
      (match) => replaceWithPlaceholder(match, "file-path"),
    );

    // 3. Protect identifiers (CamelCase, PascalCase, snake_case, UPPER_SNAKE)
    if (this.preserveIdentifiers) {
      // Dotted identifiers: console.log, fs.readFileSync
      processedText = processedText.replace(
        /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\b/g,
        (match) => replaceWithPlaceholder(match, "dotted-identifier"),
      );
      // UPPER_SNAKE: MAX_RETRIES, NODE_ENV
      processedText = processedText.replace(
        /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g,
        (match) => replaceWithPlaceholder(match, "constant"),
      );
      // PascalCase: MyComponent, EventHandler (2+ words)
      processedText = processedText.replace(
        /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g,
        (match) => replaceWithPlaceholder(match, "pascal-case"),
      );
      // camelCase: myFunction, handleClick
      processedText = processedText.replace(
        /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g,
        (match) => replaceWithPlaceholder(match, "camel-case"),
      );
      // snake_case: my_function, get_data
      processedText = processedText.replace(
        /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g,
        (match) => replaceWithPlaceholder(match, "snake-case"),
      );
    }

    // 4. Protect programming keywords
    for (const keyword of PROGRAMMING_KEYWORDS) {
      const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "g");
      processedText = processedText.replace(regex, (match) => {
        // Only replace if not already inside a placeholder
        if (!isInsidePlaceholder(processedText, processedText.indexOf(match))) {
          return replaceWithPlaceholder(match, "keyword");
        }
        return match;
      });
    }

    // 5. Protect version strings, hex colors, env vars
    processedText = processedText.replace(
      /\bv?\d+\.\d+\.\d+(?:-[\w.]+)?\b/g,
      (match) => replaceWithPlaceholder(match, "version"),
    );
    processedText = processedText.replace(/\$[A-Z_]+|%[A-Z_]+%/g, (match) =>
      replaceWithPlaceholder(match, "env-var"),
    );

    return { processedText, placeholderMap };
  }

  /**
   * Post-process translated text: restore technical terms from placeholders
   * @param {string} translatedText - Text after translation (with placeholders)
   * @param {Map<string, Object>} placeholderMap - Map from preProcess()
   * @param {string} targetLang - Target language code
   * @returns {string} Final text with technical terms restored
   */
  postProcess(translatedText, placeholderMap, targetLang = "en") {
    if (!translatedText || placeholderMap.size === 0) {
      return translatedText;
    }

    let result = translatedText;

    for (const [placeholder, info] of placeholderMap) {
      const { original, type } = info;

      let replacement = original;

      // For glossary terms, optionally use the target-language transliteration
      if (this.useGlossaryTranslation && type === "keyword") {
        const glossaryEntry = this.glossary[original.toLowerCase()];
        if (glossaryEntry && glossaryEntry[targetLang]) {
          // Use glossary transliteration but keep original in parentheses for clarity
          replacement = `${glossaryEntry[targetLang]} (${original})`;
          this.stats.glossaryHits++;
        }
      }

      // Replace all occurrences of the placeholder
      // Some translators may mangle Unicode brackets, so try variations
      const variations = [
        placeholder,
        placeholder.replace(/⟦/g, "(").replace(/⟧/g, ")"),
        placeholder.replace(/⟦/g, "[").replace(/⟧/g, "]"),
        placeholder.replace(/⟦/g, "<<").replace(/⟧/g, ">>"),
      ];

      for (const variant of variations) {
        if (result.includes(variant)) {
          result = result.split(variant).join(replacement);
          this.stats.restored++;
          break;
        }
      }

      // If placeholder not found (translator ate it), try to find closest match
      if (result.includes(`TECH${info.index}`)) {
        const fuzzyPattern = new RegExp(
          `[\\[\\(⟦<]*TECH\\s*${info.index}\\s*[\\]\\)⟧>]*`,
          "g",
        );
        result = result.replace(fuzzyPattern, replacement);
        this.stats.restored++;
      }
    }

    return result;
  }

  /**
   * Full pipeline: preProcess → translate → postProcess
   * @param {string} text - Original text
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {Function} translateFn - async (text, src, tgt) => translatedText
   * @returns {Promise<{ text: string, stats: Object }>}
   */
  async translateWithPreservation(text, sourceLang, targetLang, translateFn) {
    // Reset stats for this call
    const callStats = { preserved: 0, restored: 0, glossaryHits: 0 };
    const prevStats = { ...this.stats };

    // Step 1: Extract technical terms
    const { processedText, placeholderMap } = this.preProcess(text, sourceLang);

    // Step 2: Translate the clean text
    let translatedText;
    try {
      translatedText = await translateFn(processedText, sourceLang, targetLang);
    } catch (err) {
      // If translation fails, return original with glossary substitution only
      console.warn(
        "[TermPreservator] Translation failed, applying glossary only:",
        err.message,
      );
      translatedText = processedText;
    }

    // Step 3: Restore technical terms
    const finalText = this.postProcess(
      translatedText,
      placeholderMap,
      targetLang,
    );

    // Calculate stats delta
    callStats.preserved = this.stats.preserved - prevStats.preserved;
    callStats.restored = this.stats.restored - prevStats.restored;
    callStats.glossaryHits = this.stats.glossaryHits - prevStats.glossaryHits;

    return {
      text: finalText,
      stats: callStats,
      placeholdersUsed: placeholderMap.size,
    };
  }

  /**
   * Translate a technical term using the glossary
   * @param {string} term - English technical term
   * @param {string} targetLang - Target language code
   * @returns {string|null} Translated term or null if not in glossary
   */
  translateTerm(term, targetLang) {
    const entry = this.glossary[term.toLowerCase()];
    if (entry && entry[targetLang]) {
      return entry[targetLang];
    }
    return null;
  }

  /**
   * Get all glossary terms for a language
   * @param {string} langCode - Language code
   * @returns {Object} Map of english → translated terms
   */
  getGlossaryForLanguage(langCode) {
    const result = {};
    for (const [term, translations] of Object.entries(this.glossary)) {
      if (translations[langCode]) {
        result[term] = translations[langCode];
      }
    }
    return result;
  }

  /**
   * Add a custom term to the glossary at runtime
   * @param {string} englishTerm
   * @param {Object} translations - { langCode: translatedTerm }
   */
  addCustomTerm(englishTerm, translations) {
    const key = englishTerm.toLowerCase();
    if (!this.glossary[key]) {
      this.glossary[key] = { en: englishTerm };
    }
    Object.assign(this.glossary[key], translations);
  }

  /**
   * Analyze text for technical content density
   * @param {string} text
   * @returns {Object} Analysis with technical density score
   */
  analyzeTechnicalDensity(text) {
    if (!text) return { density: 0, technicalTokens: 0, totalTokens: 0 };

    const words = text.split(/\s+/);
    let technicalCount = 0;

    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9_$.]/g, "");
      if (
        PROGRAMMING_KEYWORDS.has(clean) ||
        /^[a-z]+[A-Z]/.test(clean) || // camelCase
        /^[A-Z][a-z]+[A-Z]/.test(clean) || // PascalCase
        /^[A-Z_]{3,}$/.test(clean) || // UPPER_CASE
        /[._]/.test(clean) || // dotted/snaked
        this.glossary[clean.toLowerCase()]
      ) {
        technicalCount++;
      }
    }

    return {
      density:
        words.length > 0
          ? Math.round((technicalCount / words.length) * 100) / 100
          : 0,
      technicalTokens: technicalCount,
      totalTokens: words.length,
      isHighlyTechnical: technicalCount / words.length > 0.3,
    };
  }

  /**
   * Get preservation statistics
   * @returns {Object}
   */
  getStats() {
    return { ...this.stats };
  }

  resetStats() {
    this.stats = { preserved: 0, restored: 0, glossaryHits: 0 };
  }
}

// Helpers

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInsidePlaceholder(text, position) {
  // Check if position is already within a ⟦TECH...⟧ placeholder
  const before = text.substring(Math.max(0, position - 20), position);
  return before.includes("⟦TECH") && !before.includes("⟧");
}

module.exports = {
  TechnicalTermPreservator,
  PROGRAMMING_KEYWORDS,
  CODE_PATTERNS,
};
