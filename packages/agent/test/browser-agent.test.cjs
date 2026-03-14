/**
 * Tests for BrowserAgent — Web Research Agent (HTTP fetch + LLM analysis)
 */
"use strict";

const assert = require("node:assert");

let BrowserAgent, BaseAgent, stripHtml, extractTitle, extractLinks;
try {
  ({ BrowserAgent, stripHtml, extractTitle, extractLinks } = require("../src/mas/agents/browser-agent"));
  ({ BaseAgent } = require("../src/mas/agents/base-agent"));
} catch (err) {
  console.log("browser-agent.js not found — skipping:", err.message);
  throw new Error("Module not loadable — skipping tests");
}

// ─── Helpers ────────────────────────────────────────────

/** Create a minimal deps object for constructing a BrowserAgent. */
function makeDeps(overrides = {}) {
  return {
    permissionGate: {
      check: async () => ({ decision: "approve_once" }),
      requestPermission: async () => ({ decision: "approved", reason: "auto" }),
    },
    memory: { shortTerm: { set: () => {}, get: () => null }, working: { set: () => {} } },
    emitEvent: () => {},
    runLLM: overrides.runLLM || (async () => "LLM mock response"),
    ...overrides,
  };
}

/** Create a mock fetch function that returns controlled responses. */
function mockFetch(responses = {}) {
  const defaultHtml = `<html><head><title>Test Page</title></head>
<body><h1>Hello</h1><p>Content here.</p>
<a href="https://example.com/page2">Link 1</a>
<a href="https://example.com/page3">Link 2</a>
</body></html>`;

  return async (url, opts) => {
    if (responses[url] === "NETWORK_ERROR") {
      throw new Error("fetch failed: ECONNREFUSED");
    }
    if (responses[url] === "TIMEOUT") {
      // Simulate abort
      if (opts?.signal) {
        return new Promise((_, reject) => {
          const onAbort = () => reject(new Error("The operation was aborted"));
          if (opts.signal.aborted) return onAbort();
          opts.signal.addEventListener("abort", onAbort);
        });
      }
      throw new Error("The operation was aborted");
    }

    const resp = responses[url] || { status: 200, body: defaultHtml, contentType: "text/html" };

    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.status === 200 ? "OK" : "Error",
      headers: {
        get: (name) => {
          if (name.toLowerCase() === "content-type") return resp.contentType || "text/html";
          return null;
        },
      },
      text: async () => resp.body || "",
    };
  };
}

// ─── Tests ──────────────────────────────────────────────

describe("BrowserAgent", () => {
  // ─── Construction & Identity ─────────────────────────

  it("instantiates with correct type", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.ok(agent);
    assert.ok(agent.descriptor);
    assert.strictEqual(agent.descriptor.type, "browser");
  });

  it("inherits from BaseAgent", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.ok(agent instanceof BaseAgent);
  });

  it("has execute method", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(typeof agent.execute, "function");
  });

  // ─── Capabilities ───────────────────────────────────

  it("capabilities honestly reports { realBrowser: false, llmSimulated: true }", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent.capabilities.realBrowser, false);
    assert.strictEqual(agent.capabilities.llmSimulated, true);
    assert.strictEqual(agent.capabilities.httpFetch, true);
    assert.strictEqual(agent.capabilities.screenshots, false);
    assert.strictEqual(agent.capabilities.formInteraction, false);
  });

  it("capabilities object is frozen", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.throws(() => {
      agent.capabilities.realBrowser = true;
    }, /Cannot assign|read only/i);
  });

  it("describeCapabilities mentions no real browser", () => {
    const agent = new BrowserAgent(makeDeps());
    const desc = agent.describeCapabilities();
    assert.ok(desc.toLowerCase().includes("not"), "Should mention it does NOT control a real browser");
  });

  // ─── URL Validation ──────────────────────────────────

  it("rejects localhost URLs", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("http://localhost:3000/api");
    assert.strictEqual(result.safe, false);
    assert.ok(result.reason.includes("blocked"));
  });

  it("rejects 127.0.0.1", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("http://127.0.0.1/secret");
    assert.strictEqual(result.safe, false);
  });

  it("rejects 0.0.0.0", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("http://0.0.0.0:8080");
    assert.strictEqual(result.safe, false);
  });

  it("rejects AWS metadata endpoint (169.254.169.254)", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("http://169.254.169.254/latest/meta-data/");
    assert.strictEqual(result.safe, false);
  });

  it("rejects private IP 10.x.x.x", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("http://10.0.0.1/admin");
    assert.strictEqual(result.safe, false);
  });

  it("rejects private IP 172.16-31.x.x", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent._validateUrl("http://172.16.0.1/").safe, false);
    assert.strictEqual(agent._validateUrl("http://172.31.255.255/").safe, false);
  });

  it("rejects private IP 192.168.x.x", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent._validateUrl("http://192.168.1.1/").safe, false);
  });

  it("rejects ftp:// scheme", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("ftp://files.example.com/data");
    assert.strictEqual(result.safe, false);
    assert.ok(result.reason.includes("Scheme"));
  });

  it("rejects javascript: scheme", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("javascript:alert(1)");
    assert.strictEqual(result.safe, false);
  });

  it("rejects invalid URLs", () => {
    const agent = new BrowserAgent(makeDeps());
    const result = agent._validateUrl("not a url at all");
    assert.strictEqual(result.safe, false);
    assert.ok(result.reason.includes("Invalid URL"));
  });

  it("accepts valid https URL", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent._validateUrl("https://example.com").safe, true);
  });

  it("accepts valid http URL", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent._validateUrl("http://example.com/path?q=1").safe, true);
  });

  // ─── HTML Utilities ──────────────────────────────────

  it("stripHtml removes tags and decodes entities", () => {
    const html = "<p>Hello &amp; <b>world</b></p>";
    const text = stripHtml(html);
    assert.ok(text.includes("Hello & world"));
    assert.ok(!text.includes("<p>"));
    assert.ok(!text.includes("<b>"));
  });

  it("stripHtml removes script and style blocks", () => {
    const html = "<div>Keep<script>evil()</script> this<style>.x{}</style></div>";
    const text = stripHtml(html);
    assert.ok(!text.includes("evil"));
    assert.ok(!text.includes(".x"));
    assert.ok(text.includes("Keep"));
    assert.ok(text.includes("this"));
  });

  it("stripHtml handles empty/null input", () => {
    assert.strictEqual(stripHtml(""), "");
    assert.strictEqual(stripHtml(null), "");
    assert.strictEqual(stripHtml(undefined), "");
  });

  it("extractTitle extracts <title> content", () => {
    assert.strictEqual(extractTitle("<html><head><title>My Page</title></head></html>"), "My Page");
  });

  it("extractTitle returns empty string when no title", () => {
    assert.strictEqual(extractTitle("<html><body>no title</body></html>"), "");
    assert.strictEqual(extractTitle(""), "");
  });

  it("extractLinks finds absolute and relative links", () => {
    const html = `<a href="https://example.com/a">A</a><a href="/b">B</a><a href="ftp://x">X</a>`;
    const links = extractLinks(html, "https://example.com");
    assert.ok(links.includes("https://example.com/a"));
    assert.ok(links.includes("https://example.com/b"));
    // ftp links should be excluded (only http/https)
    assert.ok(!links.some((l) => l.startsWith("ftp:")));
  });

  it("extractLinks deduplicates", () => {
    const html = `<a href="/x">1</a><a href="/x">2</a>`;
    const links = extractLinks(html, "https://example.com");
    assert.strictEqual(links.filter((l) => l === "https://example.com/x").length, 1);
  });

  // ─── Fetch & Execute ─────────────────────────────────

  it("_fetchPage returns structured result for valid URL", async () => {
    const fetch = mockFetch({});
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    const page = await agent._fetchPage("https://example.com");
    assert.strictEqual(page.url, "https://example.com");
    assert.strictEqual(page.title, "Test Page");
    assert.strictEqual(page.status, 200);
    assert.ok(page.textContent.includes("Hello"));
    assert.ok(page.textContent.includes("Content here"));
    assert.ok(Array.isArray(page.links));
    assert.ok(page.links.length >= 2);
  });

  it("_fetchPage rejects blocked URLs without making a request", async () => {
    let fetchCalled = false;
    const fetch = async () => { fetchCalled = true; return { ok: true, status: 200, headers: { get: () => "text/html" }, text: async () => "" }; };
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    await assert.rejects(
      () => agent._fetchPage("http://localhost:3000"),
      /Blocked/,
    );
    assert.strictEqual(fetchCalled, false, "fetch should not have been called for blocked URL");
  });

  it("_fetchPage throws on network error", async () => {
    const fetch = mockFetch({ "https://fail.example.com": "NETWORK_ERROR" });
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    await assert.rejects(
      () => agent._fetchPage("https://fail.example.com"),
      /ECONNREFUSED/,
    );
  });

  it("_fetchPage throws on HTTP error status", async () => {
    const fetch = mockFetch({
      "https://example.com/404": { status: 404, body: "Not Found", contentType: "text/html" },
    });
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    await assert.rejects(
      () => agent._fetchPage("https://example.com/404"),
      /HTTP 404/,
    );
  });

  it("_fetchPage throws on unsupported content type", async () => {
    const fetch = mockFetch({
      "https://example.com/img.png": { status: 200, body: "binary", contentType: "image/png" },
    });
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    await assert.rejects(
      () => agent._fetchPage("https://example.com/img.png"),
      /Unsupported content type/,
    );
  });

  // ─── Crawl with Depth Limits ─────────────────────────

  it("_crawl respects depth=0 — fetches only the start URL", async () => {
    const fetch = mockFetch({});
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    const pages = await agent._crawl("https://example.com", 0);
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(pages[0].url, "https://example.com");
  });

  it("_crawl follows same-domain links up to maxDepth", async () => {
    const fetch = mockFetch({
      "https://example.com": {
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>Root</title></head><body>
          <a href="https://example.com/page2">P2</a>
          <a href="https://other.com/nope">Other</a>
        </body></html>`,
      },
      "https://example.com/page2": {
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>Page 2</title></head><body>
          <a href="https://example.com/page3">P3</a>
        </body></html>`,
      },
      "https://example.com/page3": {
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>Page 3</title></head><body>Deep page</body></html>`,
      },
    });
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    // depth=1 should get root + page2, but not page3
    const pages = await agent._crawl("https://example.com", 1);
    const urls = pages.map((p) => p.url);
    assert.ok(urls.includes("https://example.com"));
    assert.ok(urls.includes("https://example.com/page2"));
    assert.ok(!urls.includes("https://other.com/nope"), "Should not follow cross-domain links");
    assert.ok(!urls.includes("https://example.com/page3"), "Should not exceed depth limit");
  });

  it("_crawl does not visit the same URL twice", async () => {
    const fetchedUrls = [];
    const fetch = async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () => `<html><head><title>Page</title></head><body>
          <a href="https://example.com/page1">Link A</a>
          <a href="https://example.com/page1">Link A dup</a>
        </body></html>`,
      };
    };
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    await agent._crawl("https://example.com/page1", 2);
    // page1 links back to itself — should only be fetched once
    assert.strictEqual(fetchedUrls.length, 1, "Should only fetch each URL once");
    assert.strictEqual(fetchedUrls[0], "https://example.com/page1");
  });

  it("_crawl handles fetch errors gracefully and continues", async () => {
    const fetch = mockFetch({
      "https://example.com": {
        status: 200,
        contentType: "text/html",
        body: `<html><head><title>Root</title></head><body>
          <a href="https://example.com/broken">Broken</a>
        </body></html>`,
      },
      "https://example.com/broken": "NETWORK_ERROR",
    });
    const agent = new BrowserAgent(makeDeps(), { fetchFn: fetch });

    const pages = await agent._crawl("https://example.com", 1);
    assert.strictEqual(pages.length, 2);
    assert.ok(pages[1].textContent.includes("Error"), "Failed page should contain error info");
  });

  // ─── execute() Integration ───────────────────────────

  it("execute() with targetUrl returns structured results", async () => {
    const fetch = mockFetch({});
    const llmResponses = [];
    const deps = makeDeps({
      runLLM: async (_sys, prompt) => {
        llmResponses.push(prompt);
        return "Summary: The page contains Hello and Content.";
      },
    });
    const agent = new BrowserAgent(deps, { fetchFn: fetch });

    const result = await agent.execute(
      { id: "node-1", goal: "Analyze example.com homepage" },
      { targetUrl: "https://example.com" },
    );

    assert.ok(result.result, "Should have a result");
    assert.ok(Array.isArray(result.pages), "Should have pages array");
    assert.ok(result.pages.length > 0, "Should have at least one page");
    assert.strictEqual(result.pages[0].url, "https://example.com");
    assert.ok(result.extractedData, "Should have extractedData");
    assert.ok(typeof result.confidence === "number", "Should have confidence score");
  });

  it("execute() returns blocked when permission denied", async () => {
    const deps = makeDeps({
      permissionGate: {
        requestPermission: async () => ({ decision: "denied", reason: "User denied" }),
      },
    });
    const agent = new BrowserAgent(deps);

    const result = await agent.execute(
      { id: "node-1", goal: "fetch something" },
      {},
    );

    assert.ok(result.result.includes("Blocked"));
    assert.strictEqual(result.confidence, 0);
  });

  // ─── Timeout Configuration ───────────────────────────

  it("respects custom fetchTimeoutMs option", async () => {
    const agent = new BrowserAgent(makeDeps(), { fetchTimeoutMs: 5000 });
    assert.strictEqual(agent._fetchTimeoutMs, 5000);
  });

  it("respects custom maxDepth option", async () => {
    const agent = new BrowserAgent(makeDeps(), { maxDepth: 5 });
    assert.strictEqual(agent._maxDepth, 5);
  });

  it("uses default maxDepth of 2", () => {
    const agent = new BrowserAgent(makeDeps());
    assert.strictEqual(agent._maxDepth, 2);
  });
});
