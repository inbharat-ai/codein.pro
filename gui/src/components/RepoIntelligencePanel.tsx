import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
import { Button, vscButtonBackground, vscButtonForeground } from "./index";
import { EmptyState } from "./ui/EmptyState";
import "./panels.css";

interface RepoScanResult {
  success?: boolean;
  fileCount: number;
  symbolCount: number;
  edgeCount: number;
}

interface SearchResult {
  file: string;
  matches: number;
  preview: string;
}

export default function RepoIntelligencePanel() {
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scanResult, setScanResult] = useState<RepoScanResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");

  const handleScanRepo = async () => {
    setScanning(true);
    setError("");
    try {
      const response = await baseAgentFetch("/repo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: ".",
          maxFiles: 10000,
          incremental: true,
        }),
      });
      const res = (await response.json()) as RepoScanResult;
      setScanResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError("Enter a search term");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setError("");
    try {
      const response = await baseAgentFetch("/repo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terms: [searchQuery],
          topK: 20,
        }),
      });
      const res = (await response.json()) as { results?: SearchResult[] };
      setSearchResults(res.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h2>Code Search</h2>
        <p>
          Scan and search your codebase for functions, classes, and patterns
        </p>
      </div>

      <section className="panel-section">
        <h3>Repository Scan</h3>
        <Button
          onClick={handleScanRepo}
          disabled={scanning}
          className="w-full"
          style={{
            backgroundColor: vscButtonBackground,
            color: vscButtonForeground,
            margin: 0,
          }}
        >
          {scanning ? "Scanning..." : "Scan Workspace"}
        </Button>
        {scanResult && (
          <div className="result-card">
            <p>Files indexed: {scanResult.fileCount}</p>
            <p>Symbols found: {scanResult.symbolCount}</p>
            <p>Dependencies: {scanResult.edgeCount}</p>
          </div>
        )}
      </section>

      <section className="panel-section">
        <h3>Search Code</h3>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search for functions, classes, variables..."
            aria-label="Search codebase"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button
            onClick={handleSearch}
            disabled={searching}
            style={{
              backgroundColor: vscButtonBackground,
              color: vscButtonForeground,
              margin: 0,
            }}
          >
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
        {searchResults.length > 0 ? (
          <div className="results-list">
            {searchResults.slice(0, 10).map((result, idx) => (
              <div key={idx} className="result-item">
                <strong>{result.file}</strong>
                <p>{result.preview}</p>
              </div>
            ))}
          </div>
        ) : !hasSearched ? (
          <EmptyState
            title="Search your codebase"
            message="Find functions, classes, and variables across your project."
          />
        ) : null}
      </section>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="error-message"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{error}</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setError("")}
              className="btn-secondary"
              style={{ fontSize: "12px", padding: "2px 8px" }}
            >
              Dismiss
            </button>
            <button
              onClick={handleScanRepo}
              className="btn-primary"
              style={{ fontSize: "12px", padding: "2px 8px" }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
