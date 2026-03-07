const crypto = require("crypto");

/**
 * @class Sanitizer
 * @description Removes prompt injection attempts, sanitizes LLM output, and escapes dangerous patterns
 * @example
 * const sanitizer = new Sanitizer();
 * const clean = sanitizer.sanitizePrompt(userInput);
 * const safe = sanitizer.sanitizeLLMOutput(modelResponse);
 */
class Sanitizer {
  constructor() {
    this.injectionPatterns = [
      /ignore previous instructions/gi,
      /forget everything/gi,
      /system override/gi,
      /admin mode/gi,
      /bypass security/gi,
      /jailbreak/gi,
      /execute command/gi,
      /delete all/gi,
      /DROP TABLE/gi,
      /exec\s*\(/gi,
      /eval\s*\(/gi,
      /__proto__/g,
      /constructor\s*\[/gi,
      /prototype\[/gi,
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
      /process\.exit/gi,
    ];

    this.sqlPatterns = [
      /['"`];?\s*OR\s+['"`]?1['"`]?\s*['"`]?=\s*['"`]?1/gi,
      /UNION\s+SELECT/gi,
      /DROP\s+TABLE/gi,
      /INSERT\s+INTO/gi,
      /DELETE\s+FROM/gi,
      /UPDATE\s+.*\s+SET/gi,
      /EXEC\s*\(/gi,
    ];

    this.xssPatterns = [
      /<script[^>]*>/gi,
      /<iframe[^>]*>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<embed[^>]*>/gi,
      /<object[^>]*>/gi,
    ];
  }

  /**
   * Sanitize user prompt input to prevent injection attacks
   * @param {string} input - Raw user input
   * @param {Object} options - Sanitization options
   * @returns {Object} Result with sanitized input and detected threats
   */
  sanitizePrompt(input, options = {}) {
    if (typeof input !== "string") {
      return {
        original: input,
        sanitized: "",
        hasThreats: true,
        threats: ["Invalid input type"],
      };
    }

    const { mode = "moderate" } = options;
    let sanitized = input;
    const threats = [];

    for (const pattern of this.injectionPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        threats.push(`Injection attempt detected: ${pattern.source}`);
        if (mode === "strict") {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, "");
        }
      }
    }

    for (const pattern of this.sqlPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        threats.push(`SQL injection pattern detected: ${pattern.source}`);
        if (mode === "strict") {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, "");
        }
      }
    }

    for (const pattern of this.xssPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(sanitized)) {
        threats.push(`XSS pattern detected: ${pattern.source}`);
        if (mode === "strict") {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, "");
        }
      }
    }

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
      threats: threats,
      isSafe: threats.length === 0,
    };
  }

  /**
   * Sanitize LLM output to prevent code injection and dangerous patterns
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
        dangerousCode.push(match ? match[0] : pattern.source);
        threats.push(`Dangerous code pattern found: ${pattern.source}`);

        if (mode === "strict") {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, "[REDACTED]");
        }
      }
    }

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
      threats: threats,
      dangerousCode: dangerousCode,
      isSafe: dangerousCode.length === 0,
    };
  }

  /**
   * Escape dangerous regex and special characters
   * @param {string} input - Input string to escape
   * @returns {string} Escaped string
   */
  escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} input - Input string to escape
   * @returns {string} Escaped string
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
   * Normalize and sanitize file paths
   * @param {string} filePath - File path to sanitize
   * @returns {string} Sanitized file path
   */
  sanitizeFilePath(filePath) {
    let clean = filePath.replace(/\0/g, "");
    clean = clean.replace(/[\[\]{}|\\]/g, "");
    clean = clean.replace(/[\x00-\x1F]/g, "");
    return clean;
  }

  /**
   * Check if content is inside a code block
   * @private
   * @param {string} text - Full text
   * @param {number} position - Position to check
   * @returns {boolean} True if position is inside code block
   */
  isInCodeBlock(text, position) {
    const beforeText = text.substring(0, position);
    const backtickCount = (beforeText.match(/```/g) || []).length;
    const backtickSingleCount = (beforeText.match(/`/g) || []).length;

    return (
      backtickCount % 2 === 1 ||
      (backtickSingleCount % 2 === 1 && backtickCount % 2 === 0)
    );
  }

  /**
   * Validate and sanitize JSON string
   * @param {string} jsonString - JSON string to validate
   * @returns {Object} Result with parsed object or error
   */
  sanitizeJSON(jsonString) {
    try {
      let clean = jsonString.trim();
      clean = clean.replace(/[\x00-\x1F]/g, "");
      const parsed = JSON.parse(clean);

      return {
        success: true,
        data: parsed,
        isSafe: true,
      };
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
   * Create hash of content for integrity checking
   * @param {string} content - Content to hash
   * @returns {string} SHA256 hash of content
   */
  createIntegrityHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Verify content hasn't been tampered with
   * @param {string} content - Content to verify
   * @param {string} hash - Expected hash
   * @returns {boolean} True if content matches hash
   */
  verifyIntegrity(content, hash) {
    return this.createIntegrityHash(content) === hash;
  }
}

module.exports = { Sanitizer };
