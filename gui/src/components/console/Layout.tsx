import { useState } from "react";
import useLLMLog from "../../hooks/useLLMLog";
import Details from "./Details";
import List from "./List";
import TotalUsage from "./TotalUsage";

export default function Layout() {
  const llmLog = useLLMLog();

  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [showTotalUsage, setShowTotalUsage] = useState(false);

  const interaction = selectedId
    ? llmLog.interactions.get(selectedId)
    : undefined;

  return llmLog.loading ? (
    <div>Loading...</div>
  ) : (
    <div className="flex h-full w-full">
      <div className="flex h-full w-full flex-col">
        {/* <div className="flex-shrink-0 border-b border-[color:var(--codin-border, #2a2845)] p-3">
          <button
            onClick={() => setShowTotalUsage(true)}
            className="float-right cursor-pointer border-none bg-transparent text-sm text-[color:var(--codin-saffron-500, #f59e0b)] underline hover:text-[color:var(--codin-saffron-400, #fbbf24)]"
          >
            View Total Usage Summary
          </button>
        </div> */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <List
            llmLog={llmLog}
            onClickInteraction={(interactionId) => {
              setSelectedId(interactionId);
            }}
          ></List>
          {interaction && (
            <Details key="{selectedId}" interaction={interaction}></Details>
          )}
        </div>
      </div>

      {/* Full-screen popover for TotalUsage */}
      {showTotalUsage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-[color:var(--codin-bg-primary, #0f0e17)] relative h-full w-full max-w-6xl overflow-hidden shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setShowTotalUsage(false)}
              className="bg-[color:var(--codin-indigo-700, #4338ca)] text-[color:var(--white, #ffffff)] hover:bg-[color:var(--codin-indigo-600, #4f46e5)] absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            >
              ×
            </button>

            {/* Content container with scroll */}
            <div className="h-full overflow-y-auto p-6">
              <TotalUsage llmLog={llmLog} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
