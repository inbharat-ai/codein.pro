import React from "react";
import { Button, lightGray, vscBackground } from "../../components";

export function fallbackRender({ error, resetErrorBoundary }: any) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="px-2"
      style={{ backgroundColor: vscBackground }}
    >
      <p>Something went wrong while rendering this message.</p>
      <p style={{ color: lightGray, fontSize: "0.85rem" }}>
        This is usually a temporary issue. Try restarting the session or
        resubmitting your message.
      </p>
      <details style={{ marginTop: "8px" }}>
        <summary
          style={{ color: lightGray, cursor: "pointer", fontSize: "0.8rem" }}
        >
          Technical details
        </summary>
        <pre
          style={{
            color: lightGray,
            fontSize: "0.75rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
        </pre>
      </details>

      <div className="text-center" style={{ marginTop: "12px" }}>
        <Button onClick={resetErrorBoundary}>Restart Session</Button>
      </div>
    </div>
  );
}
