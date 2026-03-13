const crypto = require("crypto");

/**
 * Unicode homoglyph map — maps visually similar characters to ASCII equivalents.
 * Covers Cyrillic, Greek, and common mathematical/fullwidth substitutions.
 */
const HOMOGLYPH_MAP = new Map([
  // Cyrillic
  ["\u0410", "A"],
  ["\u0430", "a"],
  ["\u0412", "B"],
  ["\u0435", "e"],
  ["\u0415", "E"],
  ["\u041D", "H"],
  ["\u043D", "h"],
  ["\u041E", "O"],
  ["\u043E", "o"],
  ["\u0420", "P"],
  ["\u0440", "p"],
  ["\u0421", "C"],
  ["\u0441", "c"],
  ["\u0422", "T"],
  ["\u0443", "y"],
  ["\u0445", "x"],
  ["\u0425", "X"],
  ["\u041C", "M"],
  ["\u041A", "K"],
  ["\u0456", "i"],
  ["\u0406", "I"],
  ["\u0458", "j"],
  // Greek
  ["\u0391", "A"],
  ["\u0392", "B"],
  ["\u0395", "E"],
  ["\u0397", "H"],
  ["\u0399", "I"],
  ["\u039A", "K"],
  ["\u039C", "M"],
  ["\u039D", "N"],
  ["\u039F", "O"],
  ["\u03A1", "P"],
  ["\u03A4", "T"],
  ["\u03A5", "Y"],
  ["\u03A7", "X"],
  ["\u03B1", "a"],
  ["\u03BF", "o"],
  ["\u03C1", "p"],
  // Fullwidth Latin
  ["\uFF21", "A"],
  ["\uFF22", "B"],
  ["\uFF23", "C"],
  ["\uFF24", "D"],
  ["\uFF25", "E"],
  ["\uFF26", "F"],
  ["\uFF27", "G"],
  ["\uFF28", "H"],
  ["\uFF29", "I"],
  ["\uFF2A", "J"],
  ["\uFF2B", "K"],
  ["\uFF2C", "L"],
  ["\uFF2D", "M"],
  ["\uFF2E", "N"],
  ["\uFF2F", "O"],
  ["\uFF30", "P"],
  ["\uFF31", "Q"],
  ["\uFF32", "R"],
  ["\uFF33", "S"],
  ["\uFF34", "T"],
  ["\uFF35", "U"],
  ["\uFF36", "V"],
  ["\uFF37", "W"],
  ["\uFF38", "X"],
  ["\uFF39", "Y"],
  ["\uFF3A", "Z"],
  ["\uFF41", "a"],
  ["\uFF42", "b"],
  ["\uFF43", "c"],
  ["\uFF44", "d"],
  ["\uFF45", "e"],
  ["\uFF46", "f"],
  ["\uFF47", "g"],
  ["\uFF48", "h"],
  ["\uFF49", "i"],
  ["\uFF4A", "j"],
  ["\uFF4B", "k"],
  ["\uFF4C", "l"],
  ["\uFF4D", "m"],
  ["\uFF4E", "n"],
  ["\uFF4F", "o"],
  ["\uFF50", "p"],
  ["\uFF51", "q"],
  ["\uFF52", "r"],
  ["\uFF53", "s"],
  ["\uFF54", "t"],
  ["\uFF55", "u"],
  ["\uFF56", "v"],
  ["\uFF57", "w"],
  ["\uFF58", "x"],
  ["\uFF59", "y"],
  ["\uFF5A", "z"],
  // Mathematical italic/bold
  ["\uD835\uDC00", "A"],
  ["\uD835\uDC01", "B"],
  ["\uD835\uDC02", "C"],
]);

/**
 * Leetspeak substitution map for normalization.
 */
const LEET_MAP = new Map([
  ["0", "o"],
  ["1", "i"],
  ["3", "e"],
  ["4", "a"],
  ["5", "s"],
  ["7", "t"],
  ["8", "b"],
  ["@", "a"],
  ["!", "i"],
  ["$", "s"],
  ["|", "i"],
]);

/**
 * @class Sanitizer
 * @description Removes prompt injection attempts, sanitizes LLM output, and escapes dangerous patterns.
 * Hardened with Unicode normalization, homoglyph resolution, entropy-based obfuscation detection,
 * and expanded threat pattern coverage.
 * @example
 * const sanitizer = new Sanitizer();
 * const clean = sanitizer.sanitizePrompt(userInput);
 * const threats = sanitizer.detectThreats(userInput);
 */
class Sanitizer {
  constructor() {
    // --- Prompt injection patterns (expanded) ---
    this.injectionPatterns = [
      // Original patterns
      /ignore\s+(all\s+)?previous\s+instructions/gi,
      /forget\s+(everything|all|prior|above)/gi,
      /system\s+override/gi,
      /admin\s+mode/gi,
      /bypass\s+(security|filter|restriction|guard)/gi,
      /jailbreak/gi,
      /execute\s+command/gi,
      /delete\s+all/gi,
      /DROP\s+TABLE/gi,
      /exec\s*\(/gi,
      /eval\s*\(/gi,
      /__proto__/g,
      /constructor\s*\[/gi,
      /prototype\s*\[/gi,

      // Indirect instruction attacks
      /disregard\s+(any|all|the|your)\s+(previous|prior|above|earlier)/gi,
      /new\s+instructions?\s*:/gi,
      /override\s+(previous|prior|above|system|safety)/gi,
      /you\s+are\s+now\s+(a|an|in|acting)/gi,
      /pretend\s+(you\s+are|to\s+be|that)/gi,
      /act\s+as\s+(if|though|a|an)/gi,
      /from\s+now\s+on\s+(you|ignore|disregard)/gi,
      /do\s+not\s+follow\s+(any|your|the|previous)/gi,

      // Role-playing / persona hijacking
      /roleplay\s+as/gi,
      /switch\s+to\s+(unrestricted|unfiltered|evil|dark)\s+mode/gi,
      /DAN\s+(mode|prompt|jailbreak)/gi,
      /developer\s+mode\s+(enabled|activated|on)/gi,
      /enter\s+(god|sudo|root|admin)\s+mode/gi,

      // System prompt extraction
      /reveal\s+(your|the|system)\s+(system\s+)?(prompt|instructions)/gi,
      /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions|rules)/gi,
      /what\s+(are|is)\s+(your|the)\s+(system\s+)?(prompt|instructions|rules)/gi,
      /repeat\s+(the|your)\s+(system\s+)?(prompt|instructions|text\s+above)/gi,
      /print\s+(your|the)\s+(system\s+)?(prompt|instructions|initial)/gi,
      /output\s+(your|the)\s+(system|initial)\s+(prompt|message|instructions)/gi,

      // Prompt recursion / meta-instructions
      /\[\s*INST\s*\]/gi,
      /\[\s*SYSTEM\s*\]/gi,
      /<<\s*SYS\s*>>/gi,
      /\[\/?\s*INST\s*\]/gi,
      /###\s*(instruction|system|human|assistant)\s*:/gi,

      // Logical operator abuse
      /if\s+.*then\s+ignore/gi,
      /regardless\s+of\s+(previous|prior|above|your)/gi,
      /notwithstanding\s+(any|the|previous|prior)/gi,

      // Encoding/obfuscation attempts
      /base64\s*[\s:]+[A-Za-z0-9+/=]{20,}/gi,
      /\\x[0-9a-f]{2}/gi,
      /\\u[0-9a-f]{4}/gi,
    ];

    this.dangerousCodePatterns = [
      /require\s*\(\s*['"]child_process['"]\s*\)/gi,
      /spawn\s*\(/gi,
      /exec\s*\(/gi,
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(/gi,
      /setInterval\s*\(/gi,
      /fs\.unlink/gi,
      /fs\.rmSync/gi,
      /fs\.rmdirSync/gi,
      /fs\.writeFileSync/gi,
      /process\.exit/gi,
      /process\.kill/gi,
      /process\.env/gi,
      /child_process/gi,
      /globalThis/gi,
      /Reflect\s*\./gi,
      /Proxy\s*\(/gi,
    ];

    this.sqlPatterns = [
      /['"`];?\s*OR\s+['"`]?1['"`]?\s*['"`]?=\s*['"`]?1/gi,
      /UNION\s+(ALL\s+)?SELECT/gi,
      /DROP\s+TABLE/gi,
      /INSERT\s+INTO/gi,
      /DELETE\s+FROM/gi,
      /UPDATE\s+.*\s+SET/gi,
      /EXEC\s*\(/gi,
      /;\s*--/g,
      /WAITFOR\s+DELAY/gi,
      /BENCHMARK\s*\(/gi,
      /LOAD_FILE\s*\(/gi,
      /INTO\s+OUTFILE/gi,
    ];

    this.xssPatterns = [
      /<script[^>]*>/gi,
      /<iframe[^>]*>/gi,
      /javascript\s*:/gi,
      /on\w+\s*=/gi,
      /<embed[^>]*>/gi,
      /<object[^>]*>/gi,
      /vbscript\s*:/gi,
      /data\s*:\s*text\/html/gi,
      /<svg[^>]*\s+on\w+/gi,
      /<img[^>]*\s+onerror/gi,
      /expression\s*\(/gi,
    ];

    // Entropy threshold for detecting obfuscated/encoded payloads
    this._entropyThreshold = 4.5;
    // Minimum length before entropy check kicks in
    this._entropyMinLength = 40;
  }

  // ---------------------------------------------------------------------------
  //  Unicode & Homoglyph Normalization
  // ---------------------------------------------------------------------------

  /**
   * Normalize a string for robust pattern matching:
   * 1. Unicode NFC normalization
   * 2. Homoglyph replacement (Cyrillic, Greek, fullwidth -> ASCII)
   * 3. Leetspeak normalization
   * 4. Accent/diacritic removal
   * 5. Collapse whitespace & zero-width characters
   * @param {string} input
   * @returns {string} Normalized string for matching purposes only.
   */
  normalizeForMatching(input) {
    if (typeof input !== "string") return "";

    // Step 1: Unicode NFC normalization
    let text = input.normalize("NFC");

    // Step 2: Remove zero-width characters (ZWJ, ZWNJ, ZWSP, soft hyphen, etc.)
    text = text.replace(
      /[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u034F\u061C\u180E]/g,
      "",
    );

    // Step 3: Replace homoglyphs
    let result = "";
    for (const char of text) {
      result += HOMOGLYPH_MAP.get(char) || char;
    }
    text = result;

    // Step 4: NFD + strip combining marks (accents/diacritics)
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Step 5: Leetspeak normalization (only on the lowercased version)
    text = text.toLowerCase();
    result = "";
    for (const char of text) {
      result += LEET_MAP.get(char) || char;
    }
    text = result;

    // Step 6: Collapse runs of whitespace
    text = text.replace(/\s+/g, " ").trim();

    return text;
  }

  // ---------------------------------------------------------------------------
  //  Entropy-based obfuscation detection
  // ---------------------------------------------------------------------------

  /**
   * Calculate Shannon entropy of a string.
   * @param {string} text
   * @returns {number} Entropy in bits per character.
   */
  calculateEntropy(text) {
    if (!text || text.length === 0) return 0;
    const freq = new Map();
    for (const ch of text) {
      freq.set(ch, (freq.get(ch) || 0) + 1);
    }
    const len = text.length;
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  /**
   * Detect obfuscated payloads by looking for high-entropy segments.
   * Splits on whitespace and checks for individual high-entropy tokens
   * as well as overall entropy of the full string.
   * @param {string} text
   * @returns {{ detected: boolean, score: number, segments: string[] }}
   */
  detectObfuscation(text) {
    if (!text || text.length < this._entropyMinLength) {
      return { detected: false, score: 0, segments: [] };
    }

    const segments = [];
    const overallEntropy = this.calculateEntropy(text);

    // Check individual tokens (long tokens with high entropy are suspicious)
    const tokens = text.split(/\s+/);
    for (const token of tokens) {
      if (token.length >= 16) {
        const tokenEntropy = this.calculateEntropy(token);
        if (tokenEntropy > this._entropyThreshold) {
          segments.push(
            token.substring(0, 32) + (token.length > 32 ? "..." : ""),
          );
        }
      }
    }

    // Check for base64-like blocks
    const b64Match = text.match(/[A-Za-z0-9+/=]{40,}/g);
    if (b64Match) {
      for (const m of b64Match) {
        segments.push(m.substring(0, 32) + "...");
      }
    }

    const detected =
      segments.length > 0 || overallEntropy > this._entropyThreshold;
    return { detected, score: overallEntropy, segments };
  }

  // ---------------------------------------------------------------------------
  //  Code block detection (improved)
  // ---------------------------------------------------------------------------

  /**
   * Check if a position falls inside a fenced code block (``` or ```lang)
   * or an inline code span (`...`).
   * Handles escaped backticks (\\`) and nested fences.
   * @private
   * @param {string} text - Full text
   * @param {number} position - Character offset to check
   * @returns {boolean}
   */
  isInCodeBlock(text, position) {
    if (position < 0 || position >= text.length) return false;
    const before = text.substring(0, position);

    // --- Fenced code blocks (``` or ~~~) ---
    // Match opening fences that are NOT escaped (not preceded by odd backslashes)
    const fencePattern = /(?:^|[^\\])(`{3,}|~{3,})/g;
    let fenceDepth = 0;
    let lastFenceChar = null;
    let lastFenceLen = 0;
    let m;
    while ((m = fencePattern.exec(before)) !== null) {
      const fence = m[1];
      const char = fence[0];
      const len = fence.length;
      if (fenceDepth === 0) {
        fenceDepth = 1;
        lastFenceChar = char;
        lastFenceLen = len;
      } else if (char === lastFenceChar && len >= lastFenceLen) {
        fenceDepth = 0;
        lastFenceChar = null;
        lastFenceLen = 0;
      }
    }
    if (fenceDepth > 0) return true;

    // --- Inline code spans (single/double backtick) ---
    // Strip escaped backticks first
    const cleaned = before.replace(/\\`/g, "  ");
    // Count unmatched single backtick runs of length 1-2
    let inInline = false;
    let i = 0;
    while (i < cleaned.length) {
      if (cleaned[i] === "`") {
        let runLen = 0;
        while (i < cleaned.length && cleaned[i] === "`") {
          runLen++;
          i++;
        }
        // Only toggle for runs of 1 or 2 (triple handled above)
        if (runLen <= 2) inInline = !inInline;
      } else {
        i++;
      }
    }
    return inInline;
  }

  // ---------------------------------------------------------------------------
  //  Threat detection (unified)
  // ---------------------------------------------------------------------------

  /**
   * Detect all threats in input text using normalized matching.
   * @param {string} input - Raw text to analyze
   * @param {Object} [options]
   * @param {boolean} [options.skipCodeBlocks=false] - Skip detections inside code blocks
   * @returns {{ threats: Array<{category: string, pattern: string, severity: string}>, score: number, isSafe: boolean }}
   */
  detectThreats(input, options = {}) {
    if (typeof input !== "string") {
      return {
        threats: [
          {
            category: "invalid",
            pattern: "non-string input",
            severity: "high",
          },
        ],
        score: 100,
        isSafe: false,
      };
    }

    const { skipCodeBlocks = false } = options;
    const normalized = this.normalizeForMatching(input);
    const threats = [];

    const scanPatterns = (patterns, category, severity) => {
      for (const pattern of patterns) {
        // Reset lastIndex for stateful regexes
        pattern.lastIndex = 0;
        // Match against both raw and normalized text
        const rawMatch = pattern.test(input);
        pattern.lastIndex = 0;
        const normMatch = pattern.test(normalized);
        pattern.lastIndex = 0;

        if (rawMatch || normMatch) {
          // Optionally skip if every occurrence is inside a code block
          if (skipCodeBlocks && rawMatch) {
            pattern.lastIndex = 0;
            let allInCode = true;
            let execMatch;
            while ((execMatch = pattern.exec(input)) !== null) {
              if (!this.isInCodeBlock(input, execMatch.index)) {
                allInCode = false;
                break;
              }
            }
            pattern.lastIndex = 0;
            if (allInCode) continue;
          }
          threats.push({
            category,
            pattern: pattern.source,
            severity,
            matchedNormalized: normMatch && !rawMatch,
          });
        }
      }
    };

    scanPatterns(this.injectionPatterns, "prompt_injection", "high");
    scanPatterns(this.sqlPatterns, "sql_injection", "high");
    scanPatterns(this.xssPatterns, "xss", "medium");
    scanPatterns(this.dangerousCodePatterns, "dangerous_code", "high");

    // Entropy-based obfuscation check
    const obfuscation = this.detectObfuscation(input);
    if (obfuscation.detected) {
      threats.push({
        category: "obfuscation",
        pattern: `entropy=${obfuscation.score.toFixed(2)}, segments=${obfuscation.segments.length}`,
        severity: "medium",
      });
    }

    // Homoglyph presence check (flag if the raw input contains non-ASCII lookalikes)
    const homoglyphCount = this._countHomoglyphs(input);
    if (homoglyphCount > 3) {
      threats.push({
        category: "homoglyph_attack",
        pattern: `${homoglyphCount} homoglyph characters detected`,
        severity: "medium",
      });
    }

    // Score: 0 = clean, 100 = maximum threat
    const score = Math.min(
      100,
      threats.reduce((acc, t) => {
        return acc + (t.severity === "high" ? 25 : 10);
      }, 0),
    );

    return {
      threats,
      score,
      isSafe: threats.length === 0,
    };
  }

  /**
   * Count homoglyph characters present in raw input.
   * @private
   */
  _countHomoglyphs(text) {
    let count = 0;
    for (const char of text) {
      if (HOMOGLYPH_MAP.has(char)) count++;
    }
    return count;
  }

  // ---------------------------------------------------------------------------
  //  sanitizePrompt (existing API, enhanced)
  // ---------------------------------------------------------------------------

  /**
   * Sanitize user prompt input to prevent injection attacks.
   * @param {string} input - Raw user input
   * @param {Object} options - Sanitization options
   * @param {string} [options.mode="moderate"] - "moderate" (detect only) or "strict" (detect & strip)
   * @param {number} [options.maxLength=100000]
   * @returns {Object} Result with sanitized input and detected threats
   */
  sanitizePrompt(input, options = {}) {
    if (typeof input !== "string") {
      return {
        original: input,
        sanitized: "",
        hasThreats: true,
        threats: ["Invalid input type"],
        isSafe: false,
      };
    }

    const { mode = "moderate" } = options;
    let sanitized = input;
    const threats = [];
    const normalized = this.normalizeForMatching(input);

    const checkAndStrip = (patterns, label) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const rawHit = pattern.test(sanitized);
        pattern.lastIndex = 0;
        const normHit = pattern.test(normalized);
        pattern.lastIndex = 0;

        if (rawHit || normHit) {
          const bypassNote =
            normHit && !rawHit ? " (detected via normalization)" : "";
          threats.push(`${label}: ${pattern.source}${bypassNote}`);
          if (mode === "strict" && rawHit) {
            pattern.lastIndex = 0;
            sanitized = sanitized.replace(pattern, "");
          }
        }
      }
    };

    checkAndStrip(this.injectionPatterns, "Injection attempt detected");
    checkAndStrip(this.sqlPatterns, "SQL injection pattern detected");
    checkAndStrip(this.xssPatterns, "XSS pattern detected");

    // Entropy check
    const obf = this.detectObfuscation(sanitized);
    if (obf.detected) {
      threats.push(
        `Obfuscated payload detected (entropy=${obf.score.toFixed(2)})`,
      );
    }

    // Homoglyph check
    const hCount = this._countHomoglyphs(sanitized);
    if (hCount > 3) {
      threats.push(`Homoglyph characters detected (${hCount})`);
    }

    // Length limit
    const maxLength = options.maxLength || 100000;
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
      threats.push(
        `Input truncated from ${input.length} to ${maxLength} characters`,
      );
    }

    return {
      original: input,
      sanitized: sanitized.trim(),
      hasThreats: threats.length > 0,
      threats,
      isSafe: threats.length === 0,
    };
  }

  // ---------------------------------------------------------------------------
  //  sanitizeLLMOutput (existing API, enhanced)
  // ---------------------------------------------------------------------------

  /**
   * Sanitize LLM output to prevent code injection and dangerous patterns.
   * @param {string} output - Raw LLM output
   * @param {Object} options - Sanitization options
   * @returns {Object} Result with sanitized output and detected threats
   */
  sanitizeLLMOutput(output, options = {}) {
    if (typeof output !== "string") {
      return {
        original: output,
        sanitized: "",
        hasThreats: true,
        threats: ["Invalid output type"],
        dangerousCode: [],
        isSafe: false,
      };
    }

    const { allowCodeBlocks = false, mode = "moderate" } = options;
    let sanitized = output;
    const threats = [];
    const dangerousCode = [];

    for (const pattern of this.dangerousCodePatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        pattern.lastIndex = 0;
        const match = sanitized.match(pattern);
        const matchStr = match ? match[0] : pattern.source;

        // If allowCodeBlocks, only flag matches outside code blocks
        if (allowCodeBlocks) {
          pattern.lastIndex = 0;
          let execMatch;
          let outsideCode = false;
          while ((execMatch = pattern.exec(sanitized)) !== null) {
            if (!this.isInCodeBlock(sanitized, execMatch.index)) {
              outsideCode = true;
              break;
            }
          }
          pattern.lastIndex = 0;
          if (!outsideCode) continue;
        }

        dangerousCode.push(matchStr);
        threats.push(`Dangerous code pattern found: ${pattern.source}`);

        if (mode === "strict") {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, "[REDACTED]");
        }
      }
    }

    // Script tag removal (always strip regardless of mode)
    const scriptTagPattern = /<script[^>]*>[\s\S]*?<\/script>/gi;
    scriptTagPattern.lastIndex = 0;
    if (scriptTagPattern.test(sanitized)) {
      threats.push("Script tags detected");
      scriptTagPattern.lastIndex = 0;
      sanitized = sanitized.replace(scriptTagPattern, "[REDACTED]");
    }

    return {
      original: output,
      sanitized: sanitized.trim(),
      hasThreats: threats.length > 0,
      threats,
      dangerousCode,
      isSafe: dangerousCode.length === 0,
    };
  }

  // ---------------------------------------------------------------------------
  //  Utility methods (preserved from original)
  // ---------------------------------------------------------------------------

  /**
   * Escape dangerous regex and special characters.
   * @param {string} input
   * @returns {string}
   */
  escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} input
   * @returns {string}
   */
  escapeHtml(input) {
    const escapeMap = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
    };
    return input.replace(/[&<>"'/]/g, (s) => escapeMap[s]);
  }

  /**
   * Normalize and sanitize file paths.
   * @param {string} filePath
   * @returns {string}
   */
  sanitizeFilePath(filePath) {
    let clean = filePath.replace(/\0/g, "");
    clean = clean.replace(/[\[\]{}|\\]/g, "");
    clean = clean.replace(/[\x00-\x1F]/g, "");
    // Prevent path traversal
    clean = clean.replace(/\.\.\//g, "").replace(/\.\.\\/g, "");
    return clean;
  }

  /**
   * Validate and sanitize JSON string.
   * @param {string} jsonString
   * @returns {Object}
   */
  sanitizeJSON(jsonString) {
    try {
      let clean = jsonString.trim();
      clean = clean.replace(/[\x00-\x1F]/g, "");
      const parsed = JSON.parse(clean);

      // Depth check to prevent deeply nested payloads
      const depth = this._jsonDepth(parsed);
      if (depth > 20) {
        return {
          success: false,
          error: "JSON nesting too deep",
          isSafe: false,
          data: null,
        };
      }

      return { success: true, data: parsed, isSafe: true };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        isSafe: false,
        data: null,
      };
    }
  }

  /**
   * @private
   */
  _jsonDepth(obj, current = 0) {
    if (current > 25) return current; // bail out
    if (obj === null || typeof obj !== "object") return current;
    let max = current;
    const keys = Array.isArray(obj) ? obj : Object.values(obj);
    for (const val of keys) {
      const d = this._jsonDepth(val, current + 1);
      if (d > max) max = d;
    }
    return max;
  }

  /**
   * Create SHA-256 hash of content for integrity checking.
   * @param {string} content
   * @returns {string}
   */
  createIntegrityHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Verify content has not been tampered with.
   * @param {string} content
   * @param {string} hash
   * @returns {boolean}
   */
  verifyIntegrity(content, hash) {
    return crypto.timingSafeEqual(
      Buffer.from(this.createIntegrityHash(content), "hex"),
      Buffer.from(hash, "hex"),
    );
  }
}

module.exports = { Sanitizer };
