import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import { LoadingSpinner } from "./ui/LoadingState";
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
  const [hasSearched, setHasSearched] = useState(false);

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
          ? await baseAgentFetch("/api/v1/research/web-search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, num_results: 10 }),
            })
          : await baseAgentFetch("/api/v1/research/code-documentation-search", {
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
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Research</h2>
        <p>Search the web and documentation for code references</p>
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
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            {loading && <LoadingSpinner className="h-3 w-3" />}
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </section>

      {/* Empty state before first search */}
      {!hasSearched && !loading && results.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 py-12"
          style={{ color: "var(--codin-fg-muted)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-10 w-10"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <p className="text-sm">
            Search the web or documentation to get started
          </p>
        </div>
      )}

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

      {/* Empty state after search with no results */}
      {hasSearched && !loading && results.length === 0 && !error && (
        <div
          className="flex flex-col items-center gap-2 py-8"
          style={{ color: "var(--codin-fg-muted)" }}
        >
          <p className="text-sm">No results found for your query</p>
          <p className="text-xs">Try different keywords or switch modes</p>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
