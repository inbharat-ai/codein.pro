import React, { useState, useEffect } from "react";
import "./DebugPanel.css";

interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
  condition?: string;
}

interface StackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  column: number;
}

interface Variable {
  name: string;
  value: string;
  type: string;
  expandable: boolean;
}

type DebugState = "running" | "paused" | "stopped";

const DebugPanel: React.FC = () => {
  const [debugState, setDebugState] = useState<DebugState>("stopped");
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [stackTrace, setStackTrace] = useState<StackFrame[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<number>(0);
  const [watchExpressions, setWatchExpressions] = useState<string[]>([]);
  const [newWatch, setNewWatch] = useState("");
  const [output, setOutput] = useState<string[]>([]);

  // Debug Controls
  const handleStart = async () => {
    setDebugState("running");
    setOutput(["🟢 Debugger started"]);
  };

  const handlePause = async () => {
    setDebugState("paused");
    setOutput((prev) => [...prev, "🟡 Debugger paused"]);
    // Fetch stack trace and variables when paused
    await updateDebugInfo();
  };

  const handleStop = async () => {
    setDebugState("stopped");
    setStackTrace([]);
    setVariables([]);
    setBreakpoints([]);
    setOutput(["🔴 Debugger stopped"]);
  };

  const handleStepOver = async () => {
    setOutput((prev) => [...prev, "→ Step over"]);
  };

  const handleStepInto = async () => {
    setOutput((prev) => [...prev, "↓ Step into"]);
  };

  const handleStepOut = async () => {
    setOutput((prev) => [...prev, "← Step out"]);
  };

  const handleContinue = async () => {
    setDebugState("running");
    setOutput((prev) => [...prev, "▶ Continue execution"]);
  };

  // Breakpoint Management
  const addBreakpoint = async (file: string, line: number) => {
    const newBreakpoint: Breakpoint = {
      id: `bp-${Date.now()}`,
      file,
      line,
      enabled: true,
    };
    setBreakpoints((prev) => [...prev, newBreakpoint]);
    setOutput((prev) => [...prev, `📍 Breakpoint added at ${file}:${line}`]);
  };

  const toggleBreakpoint = (id: string) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, enabled: !bp.enabled } : bp)),
    );
  };

  const removeBreakpoint = (id: string) => {
    setBreakpoints((prev) => prev.filter((bp) => bp.id !== id));
    setOutput((prev) => [...prev, "❌ Breakpoint removed"]);
  };

  const setConditionalBreakpoint = (id: string, condition: string) => {
    setBreakpoints((prev) =>
      prev.map((bp) => (bp.id === id ? { ...bp, condition } : bp)),
    );
  };

  // Watch Expressions
  const addWatchExpression = () => {
    if (newWatch.trim()) {
      setWatchExpressions((prev) => [...prev, newWatch]);
      setNewWatch("");
      setOutput((prev) => [...prev, `👁 Watch: ${newWatch}`]);
    }
  };

  const removeWatchExpression = (expr: string) => {
    setWatchExpressions((prev) => prev.filter((e) => e !== expr));
  };

  // Update Debug Info
  const updateDebugInfo = async () => {
    // In a real implementation, this would fetch from the debugger backend
    setStackTrace([
      { id: 0, name: "main", file: "app.ts", line: 42, column: 5 },
      {
        id: 1,
        name: "processRequest",
        file: "handler.ts",
        line: 128,
        column: 10,
      },
      {
        id: 2,
        name: "validateInput",
        file: "validator.ts",
        line: 56,
        column: 3,
      },
    ]);

    setVariables([
      { name: "this", value: "{...}", type: "Object", expandable: true },
      {
        name: "request",
        value: "Request {...}",
        type: "Object",
        expandable: true,
      },
      { name: "userId", value: "12345", type: "string", expandable: false },
      { name: "isValid", value: "true", type: "boolean", expandable: false },
      { name: "error", value: "null", type: "object", expandable: false },
    ]);
  };

  return (
    <div className="debug-panel">
      {/* Debug Toolbar */}
      <div className="debug-toolbar">
        {debugState === "stopped" ? (
          <button
            className="debug-btn start"
            onClick={handleStart}
            title="Start Debug (F5)"
          >
            ▶️ Start
          </button>
        ) : debugState === "running" ? (
          <button
            className="debug-btn pause"
            onClick={handlePause}
            title="Pause (F6)"
          >
            ⏸️ Pause
          </button>
        ) : (
          <button
            className="debug-btn continue"
            onClick={handleContinue}
            title="Continue (F5)"
          >
            ▶️ Continue
          </button>
        )}

        <button
          className="debug-btn"
          onClick={handleStepOver}
          disabled={debugState !== "paused"}
          title="Step Over (F10)"
        >
          ⤵️ Step Over
        </button>

        <button
          className="debug-btn"
          onClick={handleStepInto}
          disabled={debugState !== "paused"}
          title="Step Into (F11)"
        >
          ⬇️ Step Into
        </button>

        <button
          className="debug-btn"
          onClick={handleStepOut}
          disabled={debugState !== "paused"}
          title="Step Out (Shift+F11)"
        >
          ⬆️ Step Out
        </button>

        <button
          className="debug-btn stop"
          onClick={handleStop}
          disabled={debugState === "stopped"}
          title="Stop (Shift+F5)"
        >
          ⏹️ Stop
        </button>

        <div className="debug-state">
          {debugState === "running" && (
            <span className="state-indicator running">● Running</span>
          )}
          {debugState === "paused" && (
            <span className="state-indicator paused">● Paused</span>
          )}
          {debugState === "stopped" && (
            <span className="state-indicator stopped">● Stopped</span>
          )}
        </div>
      </div>

      <div className="debug-container">
        {/* Left Panel: Stack Trace & Breakpoints */}
        <div className="debug-left">
          {/* Breakpoints Section */}
          <div className="debug-section">
            <h3 className="section-title">
              📍 Breakpoints ({breakpoints.length})
            </h3>
            <div className="breakpoints-list">
              {breakpoints.length === 0 ? (
                <div className="empty-state">No breakpoints yet</div>
              ) : (
                breakpoints.map((bp) => (
                  <div
                    key={bp.id}
                    className={`breakpoint-item ${bp.enabled ? "enabled" : "disabled"}`}
                  >
                    <input
                      type="checkbox"
                      checked={bp.enabled}
                      onChange={() => toggleBreakpoint(bp.id)}
                      className="bp-checkbox"
                    />
                    <span className="bp-location">
                      {bp.file}:{bp.line}
                    </span>
                    {bp.condition && (
                      <span className="bp-condition">if ({bp.condition})</span>
                    )}
                    <button
                      className="bp-delete"
                      onClick={() => removeBreakpoint(bp.id)}
                      title="Remove breakpoint"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Call Stack Section */}
          <div className="debug-section">
            <h3 className="section-title">📚 Call Stack</h3>
            <div className="stack-trace">
              {stackTrace.length === 0 ? (
                <div className="empty-state">No call stack</div>
              ) : (
                stackTrace.map((frame, idx) => (
                  <div
                    key={frame.id}
                    className={`stack-frame ${selectedFrame === idx ? "selected" : ""}`}
                    onClick={() => setSelectedFrame(idx)}
                  >
                    <span className="frame-icon">→</span>
                    <span className="frame-name">{frame.name}</span>
                    <span className="frame-file">
                      {frame.file}:{frame.line}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Variables & Watch */}
        <div className="debug-right">
          {/* Variables Section */}
          <div className="debug-section">
            <h3 className="section-title">🔍 Variables</h3>
            <div className="variables-list">
              {variables.length === 0 ? (
                <div className="empty-state">No variables</div>
              ) : (
                variables.map((variable, idx) => (
                  <div key={idx} className="variable-item">
                    <span className="var-icon">
                      {variable.expandable ? "▶" : "•"}
                    </span>
                    <span className="var-name">{variable.name}</span>
                    <span className="var-type">: {variable.type}</span>
                    <span className="var-value">= {variable.value}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Watch Expressions Section */}
          <div className="debug-section">
            <h3 className="section-title">👁 Watch</h3>
            <div className="watch-input">
              <input
                type="text"
                value={newWatch}
                onChange={(e) => setNewWatch(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && addWatchExpression()}
                placeholder="Add expression..."
                className="watch-input-field"
              />
              <button onClick={addWatchExpression} className="watch-add-btn">
                +
              </button>
            </div>
            <div className="watch-list">
              {watchExpressions.map((expr, idx) => (
                <div key={idx} className="watch-item">
                  <span className="watch-expr">{expr}</span>
                  <button
                    className="watch-delete"
                    onClick={() => removeWatchExpression(expr)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Debug Console Output */}
          <div className="debug-section console-section">
            <h3 className="section-title">📝 Console</h3>
            <div className="console-output">
              {output.map((line, idx) => (
                <div key={idx} className="console-line">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugPanel;
