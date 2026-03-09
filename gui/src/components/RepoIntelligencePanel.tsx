import { useState } from "react";
import { agentFetch as baseAgentFetch } from "../util/agentConfig";
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
        <h2>Repository Intelligence</h2>
      </div>

      <section className="panel-section">
        <h3>Repository Scan</h3>
        <button onClick={handleScanRepo} disabled={scanning}>
          {scanning ? "Scanning..." : "Scan Workspace"}
        </button>
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch} disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
        {searchResults.length > 0 && (
          <div className="results-list">
            {searchResults.slice(0, 10).map((result, idx) => (
              <div key={idx} className="result-item">
                <strong>{result.file}</strong>
                <p>{result.preview}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
}
