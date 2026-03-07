import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  respondToPermission,
  selectPendingPermissions,
} from "../../redux/slices/swarmSlice";

const PERM_ICONS: Record<string, string> = {
  file_read: "📖",
  file_write: "✏️",
  command_run: "⚡",
  git_op: "🔀",
  network: "🌐",
  mcp_tool_call: "🔧",
  remote_gpu_spend: "💰",
};

export function SwarmPermissions() {
  const dispatch = useAppDispatch();
  const pending = useAppSelector(selectPendingPermissions);

  if (pending.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-yellow-400">
        Permissions ({pending.length})
      </h3>
      <div className="space-y-1.5">
        {pending.map((req) => (
          <div
            key={req.id}
            className="space-y-1 rounded border border-yellow-800/40 bg-yellow-900/20 p-2"
          >
            <div className="flex items-start gap-1.5 text-xs">
              <span>{PERM_ICONS[req.permissionType] || "🔒"}</span>
              <div className="flex-1">
                <div className="font-medium">{req.permissionType}</div>
                <div className="text-vsc-foreground/60 text-[10px]">
                  {req.action}
                </div>
                {req.costEstimate > 0 && (
                  <div className="text-[10px] text-yellow-400">
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
                className="flex-1 rounded bg-green-800 py-0.5 text-[10px] text-white hover:bg-green-700"
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
                className="flex-1 rounded bg-green-700 py-0.5 text-[10px] text-white hover:bg-green-600"
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
                className="flex-1 rounded bg-red-800 py-0.5 text-[10px] text-white hover:bg-red-700"
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
