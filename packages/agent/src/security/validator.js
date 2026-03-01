const path = require("path");
const fs = require("fs");

/**
 * @class Validator
 * @description Validates file paths, commands, and user inputs with whitelist support
 * @example
 * const validator = new Validator();
 * if (validator.isValidFilePath(userPath)) {
 *   // Safe to access file
 * }
 */
class Validator {
  constructor(options = {}) {
    this.allowedDirs = options.allowedDirs || [
      process.cwd(),
      path.join(process.cwd(), "projects"),
      path.join(process.cwd(), "data"),
    ];

    this.safeCommands = options.safeCommands || [
      "ls",
      "dir",
      "pwd",
      "cd",
      "echo",
      "cat",
      "type",
      "node",
      "npm",
      "yarn",
      "git",
      "python",
      "python3",
      "curl",
      "wget",
      "ping",
      "whoami",
      "date",
      "find",
      "grep",
      "sed",
      "awk",
      "sort",
      "uniq",
      "wc",
      "head",
      "tail",
      "chmod",
      "chown",
      "mkdir",
      "touch",
      "cp",
      "mv",
      "rm",
      "ps",
      "kill",
      "top",
      "df",
      "du",
      "tar",
      "zip",
      "unzip",
    ];

    this.dangerousCommands = [
      "rm -rf /",
      "mkfs",
      "dd",
      "fdisk",
      "shutdown",
      "reboot",
      "halt",
      "format",
      "chkdsk",
      "diskpart",
    ];

    this.forbiddenPatterns = [
      /;\s*rm\s+-rf\s+\//,
      />\s*\/dev\/sda/,
      /\|\s*nc\s+/,
      /`.*`/,
      /\$\(.*\)/,
      /&&\s*[a-z]*[0-9]*\s*=/i,
      /\|\s*sh\s*$/,
      /\|\s*bash\s*$/,
    ];
  }

  /**
   * Validate a file path for directory traversal attacks
   * @param {string} filePath - File path to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  isValidFilePath(filePath, options = {}) {
    const {
      mustExist = false,
      checkReadable = true,
      allowedDirs = this.allowedDirs,
    } = options;

    const errors = [];

    if (filePath.includes("\0")) {
      errors.push("Path contains null bytes");
      return { valid: false, errors, safe: false };
    }

    if (filePath.includes("..")) {
      errors.push("Path contains directory traversal (..)");
      return { valid: false, errors, safe: false };
    }

    let resolvedPath;
    try {
      resolvedPath = path.resolve(filePath);
    } catch (err) {
      errors.push(`Invalid path format: ${err.message}`);
      return { valid: false, errors, safe: false };
    }

    let isAllowed = false;
    for (const allowedDir of allowedDirs) {
      const allowed = path.resolve(allowedDir);
      if (
        resolvedPath === allowed ||
        resolvedPath.startsWith(allowed + path.sep)
      ) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      errors.push(`Path is outside allowed directories: ${resolvedPath}`);
      return { valid: false, errors, safe: false };
    }

    if (mustExist) {
      try {
        const stats = fs.statSync(resolvedPath);
        if (checkReadable) {
          try {
            fs.accessSync(resolvedPath, fs.constants.R_OK);
          } catch {
            errors.push("File exists but is not readable");
            return { valid: false, errors, safe: false };
          }
        }
      } catch (err) {
        errors.push(`File does not exist or is inaccessible: ${err.message}`);
        return { valid: false, errors, safe: false };
      }
    }

    return {
      valid: true,
      errors: [],
      safe: true,
      path: resolvedPath,
    };
  }

  /**
   * Validate a command string
   * @param {string} command - Command to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result
   */
  isValidCommand(command, options = {}) {
    const {
      allowChaining = false,
      strict = true,
      timeoutSeconds = 30,
    } = options;

    const errors = [];

    if (typeof command !== "string" || command.trim().length === 0) {
      return {
        valid: false,
        errors: ["Command must be non-empty string"],
        safe: false,
      };
    }

    const lowerCmd = command.toLowerCase();
    for (const dangerous of this.dangerousCommands) {
      if (lowerCmd.includes(dangerous.toLowerCase())) {
        errors.push(`Dangerous command detected: ${dangerous}`);
        return { valid: false, errors, safe: false };
      }
    }

    for (const pattern of this.forbiddenPatterns) {
      if (pattern.test(command)) {
        errors.push(`Forbidden pattern detected: ${pattern.source}`);
        return { valid: false, errors, safe: false };
      }
    }

    if (!allowChaining) {
      const chainPatterns = [/;/, /&&/, /\|\|/, /\|(?!grep)/i];
      for (const pattern of chainPatterns) {
        if (pattern.test(command)) {
          errors.push(`Command chaining not allowed: ${pattern.source}`);
          return { valid: false, errors, safe: false };
        }
      }
    }

    const baseCmd = command.split(/[\s;|&]+/)[0].toLowerCase();
    const baseCmdName = path.basename(baseCmd);

    if (strict) {
      let isWhitelisted = false;
      for (const safe of this.safeCommands) {
        if (baseCmdName === safe || baseCmdName.endsWith(safe)) {
          isWhitelisted = true;
          break;
        }
      }

      if (!isWhitelisted) {
        errors.push(`Command not in whitelist: ${baseCmdName}`);
        return { valid: false, errors, safe: false };
      }
    }

    return {
      valid: true,
      errors: [],
      safe: true,
      command: command.trim(),
      baseCommand: baseCmdName,
      timeout: timeoutSeconds,
    };
  }

  /**
   * Validate input against common attack patterns
   * @param {string} input - Input to validate
   * @param {string} type - Input type (email, url, alphanumeric, etc.)
   * @returns {Object} Validation result
   */
  validateInput(input, type = "text") {
    const errors = [];
    const patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      url: /^(https?|ftp):\/\/[^\s]+$/,
      ipv4: /^(\d{1,3}\.){3}\d{1,3}$/,
      alphanumeric: /^[a-zA-Z0-9_-]*$/,
      integer: /^-?\d+$/,
      float: /^-?\d+\.?\d*$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    };

    if (!input || typeof input !== "string") {
      return {
        valid: false,
        errors: ["Input must be a non-empty string"],
        safe: false,
      };
    }

    if (input.length > 10000) {
      errors.push("Input exceeds maximum length (10000 characters)");
      return { valid: false, errors, safe: false };
    }

    if (input.includes("\0")) {
      errors.push("Input contains null bytes");
      return { valid: false, errors, safe: false };
    }

    if (type && patterns[type]) {
      if (!patterns[type].test(input)) {
        errors.push(`Input does not match ${type} format`);
        return { valid: false, errors, safe: false };
      }
    }

    if (/[\x00-\x1F\x7F]/g.test(input)) {
      errors.push("Input contains control characters");
      return { valid: false, errors, safe: false };
    }

    return {
      valid: true,
      errors: [],
      safe: true,
      type: type,
      input: input,
    };
  }

  /**
   * Validate environment variables before execution
   * @param {Object} env - Environment variables to validate
   * @returns {Object} Validation result
   */
  validateEnvironment(env) {
    const errors = [];
    const warnings = [];

    if (typeof env !== "object") {
      return {
        valid: false,
        errors: ["Environment must be an object"],
        safe: false,
      };
    }

    for (const [key, value] of Object.entries(env)) {
      if (
        key.includes("_EVAL") ||
        key.includes("_EXEC") ||
        key.includes("_SHELL")
      ) {
        errors.push(`Suspicious environment variable: ${key}`);
      }

      if (typeof value === "string") {
        if (
          value.includes("eval") ||
          value.includes("exec") ||
          value.includes("require")
        ) {
          warnings.push(`Suspicious value in ${key}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      safe: errors.length === 0,
    };
  }

  /**
   * Sanitize and validate array of file paths
   * @param {string[]} paths - File paths to validate
   * @param {Object} options - Validation options
   * @returns {Object} Validation result with safe paths
   */
  validateFilePaths(paths, options = {}) {
    if (!Array.isArray(paths)) {
      return {
        valid: false,
        errors: ["Paths must be an array"],
        safePaths: [],
      };
    }

    const safePaths = [];
    const errors = [];

    for (const filePath of paths) {
      const result = this.isValidFilePath(filePath, options);
      if (result.valid) {
        safePaths.push(result.path);
      } else {
        errors.push({ path: filePath, errors: result.errors });
      }
    }

    return {
      valid: errors.length === 0,
      safePaths,
      errors,
      safe: errors.length === 0,
    };
  }

  /**
   * Add custom safe command to whitelist
   * @param {string} command - Command name to whitelist
   */
  addSafeCommand(command) {
    if (typeof command === "string" && !this.safeCommands.includes(command)) {
      this.safeCommands.push(command);
    }
  }

  /**
   * Add custom allowed directory
   * @param {string} dir - Directory to allow
   */
  addAllowedDirectory(dir) {
    const resolved = path.resolve(dir);
    if (!this.allowedDirs.includes(resolved)) {
      this.allowedDirs.push(resolved);
    }
  }
}

module.exports = { Validator };
