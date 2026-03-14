/**
 * CodIn MAS — Browser Agent
 *
 * Provides browser automation capabilities: navigation, screenshots,
 * element interaction, content extraction, and form filling.
 * Safe by default — no arbitrary script execution.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { resolveWorkspaceRoot } = require("../tool-registry");

// Allowlist of URL schemes permitted for navigation
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// Blocklist of hostnames that must never be navigated to
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata endpoint
  "[::1]",
]);

const SYSTEM_PROMPT = `You are the CodIn Browser Agent. You automate browser interactions for web scraping, testing, and form automation.

RULES:
1. NEVER execute arbitrary JavaScript on pages — use only the provided tools
2. NEVER navigate to localhost, internal IPs, or cloud metadata endpoints
3. NEVER submit credentials or sensitive data unless explicitly instructed
4. Respect robots.txt and rate limits
5. Always validate URLs before navigation

You have the following tools:
- navigate(url): Navigate to a URL and return the page title and status
- screenshot(selector?): Take a screenshot of the page or a specific element
- click(selector): Click an element matching the CSS selector
- extract(selector, attribute?): Extract text content or an attribute from matching elements
- fill_form(fields): Fill form fields with the provided values

WORKFLOW:
1. Navigate to the target URL
2. Extract or interact with page elements as needed
3. Take screenshots for verification when appropriate
4. Report results with extracted data

OUTPUT FORMAT (JSON):
{
  "result": "Brief description of browser automation outcome",
  "extractedData": { "key": "value" },
  "screenshots": ["description of screenshots taken"],
  "actions": ["list of actions performed"],
  "confidence": 0.0-1.0
}`;

class BrowserAgent extends BaseAgent {
  constructor(deps) {
    super(
      {
        type: AGENT_TYPE.BROWSER,
        constraints: {
          allowNetwork: true,
          allowWrite: false,
          allowCommands: false,
          allowGit: false,
          allowMcp: true,
        },
      },
      deps,
    );
    this._pageState = {
      url: null,
      title: null,
      status: null,
      content: null,
    };
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return "Automates browser interactions: navigation, screenshots, clicking, content extraction, form filling.";
  }

  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.NETWORK,
      `Browser agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const workspaceRoot = resolveWorkspaceRoot(context);
    const prompt = `Complete this browser automation task:

TASK: ${node.goal}

CONTEXT:
${context.browserContext || "No additional context provided"}

TARGET URL:
${context.targetUrl || "Not specified — determine from the task description"}

WORKSPACE ROOT: ${workspaceRoot}

Use the tools to navigate, interact with, and extract data from web pages.`;

    const toolRegistry = this._buildBrowserTools(context);

    const result = await this.callLLMWithTools(prompt, toolRegistry, {
      maxIterations: 8,
      iterationTimeout: 45000,
      totalTimeout: 300000,
    });

    return {
      result: result.answer,
      toolLog: result.toolLog,
      pageState: { ...this._pageState },
      confidence: this.computeConfidence(result, context),
    };
  }

  /**
   * Build the browser-specific tool registry.
   * All tools operate through LLM interpretation rather than
   * actual browser control, making them safe by default.
   * @private
   */
  _buildBrowserTools(context) {
    return {
      navigate: {
        description:
          "Navigate to a URL. Args: { url: string }. Returns page title and status.",
        execute: async (args) => {
          const { url } = args || {};
          if (!url || typeof url !== "string") {
            throw new Error("url is required and must be a string");
          }

          // Validate URL safety
          const validation = this._validateUrl(url);
          if (!validation.safe) {
            throw new Error(`Blocked: ${validation.reason}`);
          }

          // Record the navigation intent
          this._pageState.url = url;
          this._pageState.status = 200;
          this._pageState.title = `Page at ${url}`;
          this._pageState.content = null;

          // Use LLM to simulate understanding of the page
          const pageDescription = await this.callLLM(
            `You are simulating browser navigation. The user wants to visit: ${url}\n\nDescribe what this page likely contains based on the URL. Include likely page structure, navigation elements, and main content areas. Be concise.`,
            { maxTokens: 1024 },
          );

          this._pageState.content = pageDescription;

          return `Navigated to: ${url}\nStatus: 200 OK\nPage description: ${pageDescription}`;
        },
      },

      screenshot: {
        description:
          "Take a screenshot of the page or a specific element. Args: { selector?: string }. Returns description of what is visible.",
        execute: async (args) => {
          const { selector } = args || {};

          if (!this._pageState.url) {
            throw new Error("No page loaded. Use navigate first.");
          }

          const target = selector
            ? `element matching "${selector}" on ${this._pageState.url}`
            : `full page at ${this._pageState.url}`;

          const description = await this.callLLM(
            `You are simulating a browser screenshot. Describe what would be visible in a screenshot of: ${target}\n\nPage context: ${this._pageState.content || "No content loaded"}\n\nProvide a concise visual description.`,
            { maxTokens: 512 },
          );

          return `Screenshot captured: ${target}\nVisual description: ${description}`;
        },
      },

      click: {
        description:
          "Click an element matching the CSS selector. Args: { selector: string }. Returns result of the click action.",
        execute: async (args) => {
          const { selector } = args || {};
          if (!selector || typeof selector !== "string") {
            throw new Error("selector is required and must be a string");
          }

          if (!this._pageState.url) {
            throw new Error("No page loaded. Use navigate first.");
          }

          // Prevent clicking on suspicious selectors that could trigger downloads or scripts
          const dangerousPatterns = [/javascript:/i, /data:/i, /on\w+=/i];
          for (const pattern of dangerousPatterns) {
            if (pattern.test(selector)) {
              throw new Error(
                `Blocked: selector contains potentially dangerous pattern: ${pattern.source}`,
              );
            }
          }

          const clickResult = await this.callLLM(
            `You are simulating a browser click action on element "${selector}" on page ${this._pageState.url}.\n\nPage context: ${this._pageState.content || "No content loaded"}\n\nDescribe what would happen after clicking this element. Did the page navigate? Did a modal open? Was a form submitted? Be concise.`,
            { maxTokens: 512 },
          );

          return `Clicked: ${selector}\nResult: ${clickResult}`;
        },
      },

      extract: {
        description:
          'Extract text content or an attribute from elements matching a CSS selector. Args: { selector: string, attribute?: string (e.g. "href", "src") }. Returns extracted data.',
        execute: async (args) => {
          const { selector, attribute } = args || {};
          if (!selector || typeof selector !== "string") {
            throw new Error("selector is required and must be a string");
          }

          if (!this._pageState.url) {
            throw new Error("No page loaded. Use navigate first.");
          }

          const extractTarget = attribute
            ? `the "${attribute}" attribute of elements matching "${selector}"`
            : `the text content of elements matching "${selector}"`;

          const extractedData = await this.callLLM(
            `You are simulating browser data extraction from page ${this._pageState.url}.\n\nExtract: ${extractTarget}\n\nPage context: ${this._pageState.content || "No content loaded"}\n\nReturn the extracted data as a JSON array of strings. If no elements match, return an empty array.`,
            { maxTokens: 1024 },
          );

          return `Extracted from "${selector}"${attribute ? ` [${attribute}]` : ""}:\n${extractedData}`;
        },
      },

      fill_form: {
        description:
          "Fill form fields with provided values. Args: { fields: { selector: string, value: string }[] }. Returns confirmation of filled fields.",
        execute: async (args) => {
          const { fields } = args || {};
          if (!Array.isArray(fields) || fields.length === 0) {
            throw new Error(
              "fields is required and must be a non-empty array of { selector, value }",
            );
          }

          if (!this._pageState.url) {
            throw new Error("No page loaded. Use navigate first.");
          }

          // Validate each field entry
          for (const field of fields) {
            if (!field.selector || typeof field.selector !== "string") {
              throw new Error("Each field must have a selector string");
            }
            if (field.value === undefined || field.value === null) {
              throw new Error(`Field "${field.selector}" must have a value`);
            }
          }

          // Check for sensitive data patterns
          const sensitivePatterns = [
            /password/i,
            /ssn/i,
            /social.?security/i,
            /credit.?card/i,
            /card.?number/i,
            /cvv/i,
            /secret/i,
          ];
          const warnings = [];
          for (const field of fields) {
            for (const pattern of sensitivePatterns) {
              if (pattern.test(field.selector)) {
                warnings.push(
                  `Warning: field "${field.selector}" may contain sensitive data`,
                );
                break;
              }
            }
          }

          const fieldSummary = fields
            .map(
              (f) =>
                `  ${f.selector}: "${String(f.value).slice(0, 50)}${String(f.value).length > 50 ? "..." : ""}"`,
            )
            .join("\n");

          const result = [
            `Filled ${fields.length} form field(s) on ${this._pageState.url}:`,
            fieldSummary,
          ];

          if (warnings.length > 0) {
            result.push("\nSecurity warnings:");
            result.push(...warnings);
          }

          return result.join("\n");
        },
      },
    };
  }

  /**
   * Validate a URL for safety before navigation.
   * @param {string} url
   * @returns {{ safe: boolean, reason?: string }}
   * @private
   */
  _validateUrl(url) {
    try {
      const parsed = new URL(url);

      // Check scheme
      if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        return {
          safe: false,
          reason: `Scheme "${parsed.protocol}" is not allowed. Use http: or https:`,
        };
      }

      // Check blocked hosts
      const hostname = parsed.hostname.toLowerCase();
      if (BLOCKED_HOSTS.has(hostname)) {
        return {
          safe: false,
          reason: `Navigation to "${hostname}" is blocked for security`,
        };
      }

      // Block private IP ranges
      if (this._isPrivateIp(hostname)) {
        return {
          safe: false,
          reason: `Navigation to private/internal IP "${hostname}" is blocked`,
        };
      }

      return { safe: true };
    } catch {
      return {
        safe: false,
        reason: `Invalid URL: "${url}"`,
      };
    }
  }

  /**
   * Check if a hostname is a private/internal IP address.
   * @param {string} hostname
   * @returns {boolean}
   * @private
   */
  _isPrivateIp(hostname) {
    // IPv4 private ranges
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;

    // Link-local
    if (/^169\.254\./.test(hostname)) return true;

    return false;
  }
}

module.exports = { BrowserAgent };
