const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_SNIPPET_CHARS = 1200;
const MAX_TEXT_CHARS = 12000;

function sanitizeText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function stripHtml(html) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ");
}

function truncate(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "...";
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    return { text, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

class WebResearchService {
  constructor() {
    this.cache = new Map();
  }

  getCacheKey(prefix, value) {
    return `${prefix}:${value}`;
  }

  setCache(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  getCache(key, maxAgeMs = 5 * 60 * 1000) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > maxAgeMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Intelligent web search with automatic provider selection
   * Priority: Tavily > Brave > SerpAPI > DuckDuckGo (no API key required)
   *
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 5)
   * @returns {Promise<Array>} Array of normalized search results
   *
   * @example
   * const results = await service.searchWeb("Next.js tutorial", 5);
   * results.forEach(r => console.log(r.title, r.url));
   */
  async searchWeb(query, limit = 5) {
    const cacheKey = this.getCacheKey("web-search", `${query}:${limit}`);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const tavilyKey = process.env.CODIN_TAVILY_API_KEY;
    const braveKey = process.env.CODIN_BRAVE_API_KEY;
    const serpKey = process.env.CODIN_SERPAPI_KEY;

    let results = [];

    // Provider selection with automatic fallback
    if (tavilyKey) {
      results = await this.searchTavily(query, limit, tavilyKey);
    } else if (braveKey) {
      results = await this.searchBrave(query, limit, braveKey);
    } else if (serpKey) {
      results = await this.searchSerpApi(query, limit, serpKey);
    } else {
      // DuckDuckGo fallback - no API key required
      results = await this.searchDuckDuckGo(query, limit);
    }

    this.setCache(cacheKey, results);
    return results;
  }

  async searchDuckDuckGo(query, limit = 5) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const data = await fetchJson(url);
    const results = [];

    if (data.AbstractText) {
      results.push({
        title: data.Heading || query,
        snippet: truncate(data.AbstractText, MAX_SNIPPET_CHARS),
        url: data.AbstractURL || "",
        source: "DuckDuckGo",
        type: "abstract",
      });
    }

    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const topic of topics) {
      if (topic && topic.Text && topic.FirstURL) {
        results.push({
          title: truncate(topic.Text, 120),
          snippet: truncate(topic.Text, MAX_SNIPPET_CHARS),
          url: topic.FirstURL,
          source: "DuckDuckGo",
          type: "related",
        });
      }
      if (results.length >= limit) break;
    }

    return results.slice(0, limit);
  }

  async searchTavily(query, limit, apiKey) {
    const response = await fetchJson("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, max_results: limit }),
    });

    return (response.results || []).map((item) => ({
      title: item.title || query,
      snippet: truncate(item.content || "", MAX_SNIPPET_CHARS),
      url: item.url || "",
      source: "Tavily",
      type: "search",
    }));
  }

  async searchBrave(query, limit, apiKey) {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
    const response = await fetchJson(url, {
      headers: {
        "X-Subscription-Token": apiKey,
      },
    });

    const items =
      response.web && response.web.results ? response.web.results : [];
    return items.map((item) => ({
      title: item.title || query,
      snippet: truncate(item.description || "", MAX_SNIPPET_CHARS),
      url: item.url || "",
      source: "Brave",
      type: "search",
    }));
  }

  async searchSerpApi(query, limit, apiKey) {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const response = await fetchJson(url);
    const items = response.organic_results || [];

    return items.slice(0, limit).map((item) => ({
      title: item.title || query,
      snippet: truncate(item.snippet || "", MAX_SNIPPET_CHARS),
      url: item.link || "",
      source: "SerpAPI",
      type: "search",
    }));
  }

  /**
   * Search with Serper-compatible response format
   * Uses inbuilt search providers (DuckDuckGo/Tavily/Brave/SerpAPI) without requiring external Serper API
   *
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 5)
   * @returns {Promise<Object>} Serper-compatible response with organic results, searchParameters, and optional fields
   *
   * @example
   * const results = await service.searchSerperLike("React hooks", 5);
   * console.log(results.organic); // Array of search results
   * console.log(results.searchParameters.engine); // "codin"
   */
  async searchSerperLike(query, limit = 5) {
    // Get results using existing inbuilt search providers
    const results = await this.searchWeb(query, limit);

    // Map to Serper-like response schema with full metadata
    const organic = results.map((item, index) => ({
      position: index + 1,
      title: item.title,
      link: item.url,
      snippet: item.snippet,
      source: "CodIn Search",
      date: new Date().toISOString().split("T")[0], // Add date for compatibility
      sitelinks: [], // Best-effort field for compatibility
    }));

    return {
      searchParameters: {
        q: query,
        type: "search",
        engine: "codin",
        num: limit,
        device: "desktop",
      },
      organic,
      answerBox: {},
      knowledgeGraph: {},
      peopleAlsoAsk: [],
      relatedSearches: [],
      credits: {
        used: 0, // CodIn doesn't use credits
        remaining: Infinity,
        source: "inbuilt",
      },
    };
  }

  async fetchUrl(url) {
    const cacheKey = this.getCacheKey("fetch-url", url);
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    const { text, contentType } = await fetchText(url);
    let cleaned = text;

    if (contentType.includes("text/html")) {
      cleaned = stripHtml(text);
    }

    const result = {
      url,
      contentType,
      text: truncate(sanitizeText(cleaned), MAX_TEXT_CHARS),
      length: text.length,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  async codeDocumentationSearch(library, topic, limit = 5) {
    const query = `${library} ${topic} documentation site:docs.* OR site:github.com`;
    return this.searchWeb(query, limit);
  }

  async codeExampleSearch(language, pattern, limit = 5) {
    const query = `${language} ${pattern} example site:github.com OR site:stackoverflow.com`;
    return this.searchWeb(query, limit);
  }

  async bugSolutionSearch(errorMessage, language = "", limit = 5) {
    const query = `${language} ${errorMessage} solution`;
    return this.searchWeb(query, limit);
  }

  cacheStats() {
    return {
      size: this.cache.size,
    };
  }
}

const webResearchService = new WebResearchService();

module.exports = {
  webResearchService,
};
