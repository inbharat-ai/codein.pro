import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import "./panels.css";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export default function ResearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"search" | "docs">("search");

  const handleSearch = async () => {
    if (!query.trim()) {
      setError("Enter a search query");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response =
        mode === "search"
          ? await baseAgentFetch("/api/research/web-search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, num_results: 10 }),
            })
          : await baseAgentFetch("/api/research/code-documentation-search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                library: query.trim().split(/\s+/)[0] || query,
                topic: query,
                num_results: 10,
              }),
            });
      const res = (await response.json()) as { results?: SearchResult[] };
      setResults(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Research & Documentation</h2>
      </div>

      <section className="panel-section">
        <div className="mode-selector">
          <button
            className={mode === "search" ? "active" : ""}
            onClick={() => setMode("search")}
          >
            Web Search
          </button>
          <button
            className={mode === "docs" ? "active" : ""}
            onClick={() => setMode("docs")}
          >
            Documentation
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder={
              mode === "search"
                ? "Search the web..."
                : "Search documentation..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </section>

      {results.length > 0 && (
        <section className="panel-section">
          <div className="results-list">
            {results.map((result, idx) => (
              <div key={idx} className="result-item">
                <h4>{result.title}</h4>
                <p className="snippet">{result.snippet}</p>
                {result.url && (
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
