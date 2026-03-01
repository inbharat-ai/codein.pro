import { useContext, useMemo, useState } from "react";
import { IdeMessengerContext } from "../context/IdeMessenger";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { setPendingEditContract } from "../redux/slices/sessionSlice";

export function ImplementPreviewPanel() {
  const ideMessenger = useContext(IdeMessengerContext);
  const dispatch = useAppDispatch();
  const contract = useAppSelector((state) => state.session.pendingEditContract);
  const [backupId, setBackupId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const hasContract = !!contract;

  const patchCount = useMemo(() => contract?.patches.length ?? 0, [contract]);
  const newFileCount = useMemo(
    () => contract?.new_files.length ?? 0,
    [contract],
  );

  if (!hasContract || !contract) {
    return null;
  }

  return (
    <div className="border-border m-2 rounded-md border border-solid p-3 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Implement Preview</div>
          <div className="opacity-70">
            {patchCount} patch{patchCount === 1 ? "" : "es"} • {newFileCount}{" "}
            new file{newFileCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-vsc-button text-vsc-button-foreground rounded px-2 py-1 text-xs"
            onClick={async () => {
              const response = await ideMessenger.request("contract/apply", {
                contract,
              });
              const result = response as any;
              if (result?.backupId) {
                setBackupId(result.backupId);
              }
            }}
          >
            Apply
          </button>
          {backupId && (
            <button
              className="bg-vsc-input-background rounded px-2 py-1 text-xs"
              onClick={async () => {
                await ideMessenger.request("contract/rollback", { backupId });
              }}
            >
              Rollback
            </button>
          )}
          <button
            className="bg-vsc-input-background rounded px-2 py-1 text-xs"
            onClick={() => dispatch(setPendingEditContract(undefined))}
          >
            Dismiss
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {contract.plan.length > 0 && (
          <div>
            <div className="font-semibold">Plan</div>
            <ol className="ml-4 list-decimal space-y-1">
              {contract.plan.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {contract.patches.map((patch, idx) => (
          <div
            key={`${patch.path}-${idx}`}
            className="border-vsc-input-border rounded border border-solid p-2"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">{patch.path}</div>
              <button
                className="text-xs underline"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [idx]: !prev[idx],
                  }))
                }
              >
                {expanded[idx] ? "Hide diff" : "Show diff"}
              </button>
            </div>
            {expanded[idx] && (
              <pre className="bg-vsc-input-background mt-2 whitespace-pre-wrap rounded p-2 text-[11px]">
                {patch.diff}
              </pre>
            )}
          </div>
        ))}

        {contract.new_files.map((file, idx) => (
          <div
            key={`${file.path}-${idx}`}
            className="border-vsc-input-border rounded border border-solid p-2"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">{file.path}</div>
              <button
                className="text-xs underline"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    [patchCount + idx]: !prev[patchCount + idx],
                  }))
                }
              >
                {expanded[patchCount + idx] ? "Hide file" : "Show file"}
              </button>
            </div>
            {expanded[patchCount + idx] && (
              <pre className="bg-vsc-input-background mt-2 whitespace-pre-wrap rounded p-2 text-[11px]">
                {file.content}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
