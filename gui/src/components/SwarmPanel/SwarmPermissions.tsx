import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  respondToPermission,
  selectPendingPermissions,
} from "../../redux/slices/swarmSlice";

const PERM_ICONS: Record<string, string> = {
  file_read: "\u{1F4D6}",
  file_write: "\u{270F}\uFE0F",
  command_run: "\u{26A1}",
  git_op: "\u{1F500}",
  network: "\u{1F310}",
  mcp_tool_call: "\u{1F527}",
  remote_gpu_spend: "\u{1F4B0}",
};

export function SwarmPermissions() {
  const dispatch = useAppDispatch();
  const pending = useAppSelector(selectPendingPermissions);

  if (pending.length === 0) {
    return (
      <div>
        <h3 className="text-codin-fg-secondary mb-1 text-xs font-semibold">
          Permissions
        </h3>
        <p className="text-codin-fg-muted text-[10px]">
          No pending permission requests
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-codin-saffron-400 mb-1.5 text-xs font-semibold">
        Permissions{" "}
        <span className="text-codin-saffron-300 font-normal">
          ({pending.length})
        </span>
      </h3>
      <div className="space-y-1.5">
        {pending.map((req) => (
          <div
            key={req.id}
            className="border-codin-saffron-600/25 bg-codin-saffron-500/8 space-y-1.5 rounded-md border p-2.5"
          >
            <div className="flex items-start gap-1.5 text-xs">
              <span>{PERM_ICONS[req.permissionType] || "\u{1F512}"}</span>
              <div className="flex-1">
                <div className="text-codin-fg font-medium">
                  {req.permissionType}
                </div>
                <div className="text-codin-fg-muted text-[10px]">
                  {req.action}
                </div>
                {req.costEstimate > 0 && (
                  <div className="text-codin-saffron-400 font-mono text-[10px]">
                    Est. cost: ${req.costEstimate.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() =>
                  dispatch(
                    respondToPermission({
                      requestId: req.id,
                      response: "approve_once",
                    }),
                  )
                }
                className="flex-1 rounded bg-emerald-600/80 py-1 text-[10px] font-medium text-white transition-colors hover:bg-emerald-500/80"
              >
                Once
              </button>
              <button
                onClick={() =>
                  dispatch(
                    respondToPermission({
                      requestId: req.id,
                      response: "approve_always",
                    }),
                  )
                }
                className="flex-1 rounded bg-emerald-500/80 py-1 text-[10px] font-medium text-white transition-colors hover:bg-emerald-400/80"
              >
                Always
              </button>
              <button
                onClick={() =>
                  dispatch(
                    respondToPermission({
                      requestId: req.id,
                      response: "deny",
                    }),
                  )
                }
                className="flex-1 rounded bg-red-600/60 py-1 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/60"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
