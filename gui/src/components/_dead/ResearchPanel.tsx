import React, { useState } from "react";
import { agentFetch } from "../util/agentConfig";
import "./ResearchPanel.css";

interface ResearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
  type?: string;
}

interface ResearchState {
  query: string;
  results: ResearchResult[];
  loading: boolean;
  error?: string;
  history: string[];
}

const ResearchPanel: React.FC = () => {
  const [state, setState] = useState<ResearchState>({
    query: "",
    results: [],
    loading: false,
    history: [],
  });
  const [activeTab, setActiveTab] = useState<
    "search" | "code-docs" | "examples" | "bugs"
  >("search");
  const [searchType, setSearchType] = useState("web");

  const handleSearch = async () => {
    if (!state.query.trim()) return;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: undefined,
    }));

    try {
      let endpoint = "/api/research/web-search";
      let body: Record<string, any> = { query: state.query, num_results: 10 };

      if (activeTab === "code-docs") {
        endpoint = "/api/research/code-documentation-search";
        body = { library: state.query.split(" ")[0], topic: state.query };
      } else if (activeTab === "examples") {
        endpoint = "/api/research/code-example-search";
        body = { language: state.query.split(" ")[0], pattern: state.query };
      } else if (activeTab === "bugs") {
        endpoint = "/api/research/bug-solution-search";
        body = { error_message: state.query, language: "" };
      }

      const response = await agentFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error(`Status ${response.status}`);

      const data = await response.json();
      const results = data.data || data.results || [];

      setState((prev) => ({
        ...prev,
        results: Array.isArray(results) ? results : [],
        loading: false,
        history: [state.query, ...prev.history].slice(0, 10),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      }));
    }
  };

  const handleHistoryClick = (query: string) => {
    setState((prev) => ({ ...prev, query }));
  };

  const openUrl = (url: string) => {
    window.open(url, "_blank");
  };

  return (
    <div className="research-panel">
      {/* Header */}
      <div className="research-header">
        <h2>🔍 Research Assistant</h2>
        <p>Search web, documentation, examples, and solutions</p>
      </div>

      {/* Search Tabs */}
      <div className="research-tabs">
        <button
          className={`tab ${activeTab === "search" ? "active" : ""}`}
          onClick={() => setActiveTab("search")}
        >
          🌐 Web Search
        </button>
        <button
          className={`tab ${activeTab === "code-docs" ? "active" : ""}`}
          onClick={() => setActiveTab("code-docs")}
        >
          📚 Docs
        </button>
        <button
          className={`tab ${activeTab === "examples" ? "active" : ""}`}
          onClick={() => setActiveTab("examples")}
        >
          💡 Examples
        </button>
        <button
          className={`tab ${activeTab === "bugs" ? "active" : ""}`}
          onClick={() => setActiveTab("bugs")}
        >
          🐛 Issues
        </button>
      </div>

      {/* Search Input */}
      <div className="research-search">
        <input
          type="text"
          value={state.query}
          onChange={(e) =>
            setState((prev) => ({ ...prev, query: e.target.value }))
          }
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          placeholder={
            activeTab === "code-docs"
              ? "e.g., react hooks"
              : activeTab === "examples"
                ? "e.g., typescript async await"
                : activeTab === "bugs"
                  ? "e.g., TypeError: Cannot read property"
                  : "Search the web..."
          }
          className="search-input"
        />
        <button
          onClick={handleSearch}
          disabled={state.loading || !state.query.trim()}
          className={`search-btn ${state.loading ? "loading" : ""}`}
        >
          {state.loading ? "⏳ Searching..." : "🔍 Search"}
        </button>
      </div>

      {/* History */}
      {state.history.length > 0 && (
        <div className="search-history">
          <div className="history-label">📜 Recent Searches:</div>
          <div className="history-list">
            {state.history.map((query, idx) => (
              <button
                key={idx}
                className="history-item"
                onClick={() => handleHistoryClick(query)}
                title={query}
              >
                {query.substring(0, 30)}...
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="research-error">
          <span>⚠️</span> {state.error}
        </div>
      )}

      {/* Results */}
      <div className="research-results">
        {state.results.length === 0 && !state.loading && (
          <div className="empty-results">
            <div className="empty-icon">
              {activeTab === "code-docs" && "📚"}
              {activeTab === "examples" && "💡"}
              {activeTab === "bugs" && "🐛"}
              {activeTab === "search" && "🔍"}
            </div>
            <p>
              {activeTab === "search" && "Search the web for information"}
              {activeTab === "code-docs" && "Search for code documentation"}
              {activeTab === "examples" && "Find code examples and patterns"}
              {activeTab === "bugs" && "Find solutions to errors and issues"}
            </p>
          </div>
        )}

        {state.results.map((result, idx) => (
          <div key={idx} className="result-card">
            <div className="result-header">
              <h3 className="result-title">{result.title}</h3>
              {result.type && (
                <span className="result-type">{result.type}</span>
              )}
              <span className="result-source">{result.source}</span>
            </div>

            <p className="result-snippet">{result.snippet}</p>

            <div className="result-footer">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="result-url"
              >
                🔗 {result.url.substring(0, 50)}...
              </a>
              <button
                className="result-copy-btn"
                onClick={() => navigator.clipboard.writeText(result.url)}
              >
                📋 Copy URL
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Features Info */}
      <div className="research-features">
        <h4>✨ Research Features:</h4>
        <ul>
          <li>
            🌐 <strong>Web Search</strong> - Search the internet for information
          </li>
          <li>
            📚 <strong>Documentation</strong> - Find official docs for libraries
            and frameworks
          </li>
          <li>
            💡 <strong>Code Examples</strong> - Discover working code samples
            and patterns
          </li>
          <li>
            🐛 <strong>Bug Solutions</strong> - Find solutions to errors and
            common issues
          </li>
          <li>
            📜 <strong>Search History</strong> - Access your recent searches
          </li>
          <li>
            ⚡ <strong>Smart Caching</strong> - Results are cached for faster
            retrieval
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ResearchPanel;
