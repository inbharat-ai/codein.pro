import { ClockIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useState, useCallback } from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { History } from "../../components/History";
import { Chat } from "./Chat";

export default function GUI() {
  const [showHistory, setShowHistory] = useState(false);

  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => !prev);
  }, []);

  return (
    <div className="flex h-full w-full flex-row overflow-hidden">
      {/* History sidebar — visible on wide screens OR when toggled */}
      <aside
        className={`border-codin-border no-scrollbar flex-shrink-0 overflow-y-auto border-0 border-r border-solid transition-all duration-200 ${
          showHistory
            ? "w-80 opacity-100"
            : "4xl:w-80 4xl:opacity-100 w-0 opacity-0"
        }`}
        style={{
          background: "var(--codin-bg-secondary, #141320)",
        }}
      >
        <div className="flex h-full min-w-[320px] flex-col">
          {/* History header with close button */}
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{
              borderColor: "var(--codin-border, rgba(99,102,241,0.12))",
            }}
          >
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--codin-fg-secondary, #a8a5c0)" }}
            >
              Session History
            </span>
            <button
              onClick={toggleHistory}
              className="4xl:hidden flex items-center justify-center rounded p-0.5 transition-colors"
              style={{ color: "var(--codin-fg-muted, #8b88ad)" }}
              title="Close history"
              aria-label="Close history panel"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <ErrorBoundary>
            <History />
          </ErrorBoundary>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="no-scrollbar relative flex flex-1 flex-col overflow-y-auto">
        {/* History toggle button — hidden when sidebar is always visible on 4xl */}
        {!showHistory && (
          <button
            onClick={toggleHistory}
            className="4xl:hidden absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-all"
            style={{
              background: "var(--codin-bg-tertiary, #1a1832)",
              color: "var(--codin-fg-muted, #8b88ad)",
              border: "1px solid var(--codin-border, rgba(99,102,241,0.12))",
            }}
            title="Show session history"
            aria-label="Show session history"
          >
            <ClockIcon className="h-3.5 w-3.5" />
            History
          </button>
        )}
        <ErrorBoundary>
          <Chat />
        </ErrorBoundary>
      </main>
    </div>
  );
}
