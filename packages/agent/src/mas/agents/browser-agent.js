/**
 * CodeIn MAS — Web Research Agent
 *
 * Fetches and analyzes web content via HTTP + LLM.
 * Does NOT control a real browser.
 *
 * This agent uses fetch() to retrieve web pages, strips HTML to extract
 * text content, then passes it to an LLM for analysis and summarization.
 * It can follow links up to a configurable depth for deeper research.
 *
 * Previously named "Browser Agent" — renamed for honesty. There is no
 * headless browser, Puppeteer, or Playwright involved. All web interaction
 * is plain HTTP GET requests analyzed by an LLM.
 */
"use strict";

const { BaseAgent } = require("./base-agent");
const {
  AGENT_TYPE,
  PERMISSION_TYPE,
  PERMISSION_DECISION,
} = require("../types");
const { resolveWorkspaceRoot } = require("../tool-registry");

// Allowlist of URL schemes permitted for requests
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

// Blocklist of hostnames that must never be accessed
const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS metadata endpoint
  "[::1]",
]);

// Defaults
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_USER_AGENT =
  "CodeIn-WebResearchAgent/1.0 (LLM-assisted; +https://github.com/codin-ide)";

const SYSTEM_PROMPT = `You are the CodeIn Web Research Agent. You fetch real web pages via HTTP and analyze their content using an LLM.

IMPORTANT: You do NOT control a real browser. You make HTTP GET requests and analyze the text content.

CAPABILITIES:
- Fetch web pages via HTTP GET with proper timeout and error handling
- Extract readable text content from HTML
- Analyze and summarize page content
- Follow links to gather deeper information (up to a configurable depth)
- Return structured results with URL, title, summary, extracted data, and links

RULES:
1. NEVER access localhost, internal IPs, or cloud metadata endpoints
2. NEVER submit credentials or sensitive data
3. Respect rate limits — add delays between requests
4. Always validate URLs before fetching
5. Be transparent that analysis is LLM-assisted, not from real DOM interaction

OUTPUT FORMAT (JSON):
{
  "result": "Summary of web research findings",
  "pages": [{ "url": "...", "title": "...", "summary": "..." }],
  "extractedData": { "key": "value" },
  "confidence": 0.0-1.0
}`;

/**
 * Strip HTML tags and decode basic entities. Returns readable plain text.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  let text = html;
  // Remove script and style blocks entirely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // Replace block-level tags with newlines
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|br|hr)[^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/**
 * Extract a <title> from HTML.
 * @param {string} html
 * @returns {string}
 */
function extractTitle(html) {
  if (!html || typeof html !== "string") return "";
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).trim() : "";
}

/**
 * Extract href links from HTML.
 * @param {string} html
 * @param {string} baseUrl — Base URL for resolving relative links
 * @returns {string[]} Array of absolute URLs
 */
function extractLinks(html, baseUrl) {
  if (!html || typeof html !== "string") return [];
  const links = [];
  const seen = new Set();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const absolute = new URL(m[1], baseUrl).href;
      if (!seen.has(absolute) && /^https?:/.test(absolute)) {
        seen.add(absolute);
        links.push(absolute);
      }
    } catch {
      // Skip malformed URLs
    }
  }
  return links;
}

class BrowserAgent extends BaseAgent {
  /**
   * @param {object} deps — Standard BaseAgent dependencies
   * @param {object} [opts] — Agent-specific options
   * @param {number} [opts.maxDepth=2] — Max link-follow depth
   * @param {number} [opts.fetchTimeoutMs=15000] — Per-request timeout
   * @param {function} [opts.fetchFn] — Injectable fetch (for testing)
   */
  constructor(deps, opts = {}) {
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

    /** @readonly Honestly declares what this agent can and cannot do. */
    this.capabilities = Object.freeze({
      realBrowser: false,
      llmSimulated: true,
      httpFetch: true,
      htmlParsing: true,
      javascript: false,
      screenshots: false,
      formInteraction: false,
    });

    this._maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
    this._fetchTimeoutMs = opts.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this._fetchFn = opts.fetchFn || globalThis.fetch;
  }

  getSystemPrompt() {
    return SYSTEM_PROMPT;
  }

  describeCapabilities() {
    return (
      "Web research via HTTP fetch + LLM analysis. " +
      "Does NOT control a real browser. " +
      "Can fetch pages, extract text, follow links, and summarize content."
    );
  }

  /**
   * Execute a web research task.
   *
   * @param {object} node — TaskNode from the graph
   * @param {object} context — Shared execution context
   * @returns {Promise<{ result: string, pages: object[], extractedData: object, confidence: number }>}
   */
  async execute(node, context) {
    const perm = await this.requestPermission(
      node.id,
      PERMISSION_TYPE.NETWORK,
      `Web research agent: ${node.goal}`,
    );
    if (perm.decision !== PERMISSION_DECISION.APPROVED) {
      return { result: `Blocked: ${perm.reason}`, confidence: 0 };
    }

    const targetUrl = context.targetUrl || null;
    const maxDepth = context.maxDepth ?? this._maxDepth;
    const workspaceRoot = resolveWorkspaceRoot(context);

    // If we have a direct URL, fetch and analyze it
    if (targetUrl) {
      const pages = await this._crawl(targetUrl, maxDepth);

      // Build a combined text for LLM analysis
      const combinedContent = pages
        .map((p) => `## ${p.title || p.url}\n${p.textContent.slice(0, 4000)}`)
        .join("\n\n---\n\n");

      const analysisPrompt = `Analyze the following web content for this research task:

TASK: ${node.goal}

WORKSPACE ROOT: ${workspaceRoot}

WEB CONTENT (${pages.length} page(s)):
${combinedContent.slice(0, 12000)}

Provide a structured summary addressing the task. Include key findings and relevant data.`;

      const analysis = await this.callLLM(analysisPrompt, { maxTokens: 2048 });

      return {
        result: analysis,
        pages: pages.map((p) => ({
          url: p.url,
          title: p.title,
          summary: p.textContent.slice(0, 500),
          links: p.links.slice(0, 20),
        })),
        extractedData: {
          pageCount: pages.length,
          urls: pages.map((p) => p.url),
        },
        confidence: this.computeConfidence({ answer: analysis }, context),
      };
    }

    // No URL — use LLM tool loop to determine what to research
    const toolRegistry = this._buildResearchTools(context, maxDepth);

    const prompt = `Complete this web research task:

TASK: ${node.goal}

CONTEXT:
${context.browserContext || "No additional context provided"}

WORKSPACE ROOT: ${workspaceRoot}

Use the fetch_page tool to retrieve and analyze web pages. Use follow_links to go deeper.`;

    const result = await this.callLLMWithTools(prompt, toolRegistry, {
      maxIterations: 8,
      iterationTimeout: 45000,
      totalTimeout: 300000,
    });

    return {
      result: result.answer,
      toolLog: result.toolLog,
      pages: [],
      extractedData: {},
      confidence: this.computeConfidence(result, context),
    };
  }

  // ─── Core Fetch Logic ──────────────────────────────────

  /**
   * Fetch a single URL via HTTP GET. Returns structured page data.
   * @param {string} url
   * @returns {Promise<{ url: string, title: string, textContent: string, links: string[], status: number }>}
   */
  async _fetchPage(url) {
    const validation = this._validateUrl(url);
    if (!validation.safe) {
      throw new Error(`Blocked: ${validation.reason}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._fetchTimeoutMs);

    try {
      const response = await this._fetchFn(url, {
        method: "GET",
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          Accept: "text/html, application/xhtml+xml, text/plain, */*;q=0.8",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ""}`);
      }

      // Read body with size limit
      const contentType = response.headers?.get?.("content-type") || "";
      if (
        !contentType.includes("text/") &&
        !contentType.includes("html") &&
        !contentType.includes("json") &&
        !contentType.includes("xml")
      ) {
        throw new Error(`Unsupported content type: ${contentType}`);
      }

      const html = await response.text();
      const truncated = html.slice(0, DEFAULT_MAX_BODY_BYTES);
      const title = extractTitle(truncated);
      const textContent = stripHtml(truncated);
      const links = extractLinks(truncated, url);

      return {
        url,
        title,
        textContent,
        links,
        status: response.status,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Crawl starting from a URL, following links up to maxDepth.
   * @param {string} startUrl
   * @param {number} maxDepth
   * @returns {Promise<Array<{ url: string, title: string, textContent: string, links: string[], status: number }>>}
   */
  async _crawl(startUrl, maxDepth) {
    const visited = new Set();
    const results = [];

    const queue = [{ url: startUrl, depth: 0 }];

    while (queue.length > 0 && results.length < 10) {
      const { url, depth } = queue.shift();

      if (visited.has(url)) continue;
      visited.add(url);

      try {
        const page = await this._fetchPage(url);
        results.push(page);

        // Follow links if we haven't hit max depth
        if (depth < maxDepth) {
          // Only follow links on the same domain to avoid unbounded crawling
          const baseDomain = new URL(startUrl).hostname;
          for (const link of page.links.slice(0, 5)) {
            try {
              if (new URL(link).hostname === baseDomain && !visited.has(link)) {
                queue.push({ url: link, depth: depth + 1 });
              }
            } catch {
              // Skip malformed
            }
          }
        }
      } catch (err) {
        // Record failed fetch but continue crawling
        results.push({
          url,
          title: "",
          textContent: `Error fetching page: ${err.message}`,
          links: [],
          status: 0,
        });
      }
    }

    return results;
  }

  // ─── Tool Registry for LLM Tool Loop ──────────────────

  /**
   * Build the research-specific tool registry for LLM tool-use loop.
   * @private
   */
  _buildResearchTools(context, maxDepth) {
    return {
      fetch_page: {
        description:
          "Fetch a web page and extract its text content. Args: { url: string }. Returns page title, text content, and discovered links.",
        execute: async (args) => {
          const { url } = args || {};
          if (!url || typeof url !== "string") {
            throw new Error("url is required and must be a string");
          }
          const page = await this._fetchPage(url);
          const summary = page.textContent.slice(0, 3000);
          const topLinks = page.links.slice(0, 10).join("\n  ");
          return `Title: ${page.title}\nStatus: ${page.status}\n\nContent (first 3000 chars):\n${summary}\n\nLinks found:\n  ${topLinks}`;
        },
      },

      follow_links: {
        description:
          "Crawl a URL and follow links up to the configured depth. Args: { url: string, depth?: number }. Returns summaries of all pages visited.",
        execute: async (args) => {
          const { url, depth } = args || {};
          if (!url || typeof url !== "string") {
            throw new Error("url is required and must be a string");
          }
          const effectiveDepth = Math.min(depth ?? maxDepth, maxDepth);
          const pages = await this._crawl(url, effectiveDepth);
          return pages
            .map(
              (p) =>
                `[${p.status}] ${p.url}\n  Title: ${p.title}\n  Content preview: ${p.textContent.slice(0, 500)}`,
            )
            .join("\n\n");
        },
      },

      analyze_content: {
        description:
          "Pass text content to the LLM for analysis. Args: { content: string, question: string }. Returns the LLM's analysis.",
        execute: async (args) => {
          const { content, question } = args || {};
          if (!content || !question) {
            throw new Error("Both content and question are required");
          }
          const analysis = await this.callLLM(
            `Analyze the following content and answer the question.\n\nQUESTION: ${question}\n\nCONTENT:\n${String(content).slice(0, 8000)}`,
            { maxTokens: 1024 },
          );
          return analysis;
        },
      },
    };
  }

  // ─── URL Validation ────────────────────────────────────

  /**
   * Validate a URL for safety before making a request.
   * @param {string} url
   * @returns {{ safe: boolean, reason?: string }}
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
          reason: `Access to "${hostname}" is blocked for security`,
        };
      }

      // Block private IP ranges
      if (this._isPrivateIp(hostname)) {
        return {
          safe: false,
          reason: `Access to private/internal IP "${hostname}" is blocked`,
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
    if (/^10\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^169\.254\./.test(hostname)) return true;
    return false;
  }
}

module.exports = { BrowserAgent, stripHtml, extractTitle, extractLinks };
