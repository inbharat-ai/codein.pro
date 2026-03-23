import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef } from "react";
import { useAppDispatch } from "../../redux/hooks";
import { toggleTerminal } from "../../redux/slices/workspaceSlice";
import "./TerminalPanel.css";

export function TerminalPanel() {
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current || termRef.current) return;

      try {
        const { Terminal } = await import("xterm");
        const { FitAddon } = await import("xterm-addon-fit");
        await import("xterm/css/xterm.css");

        if (!mounted || !containerRef.current) return;

        const term = new Terminal({
          fontSize: 13,
          fontFamily:
            "var(--codin-font-mono, 'JetBrains Mono', 'Fira Code', monospace)",
          theme: {
            background: "#0f0e17",
            foreground: "#e8e6f0",
            cursor: "#f59e0b",
            selectionBackground: "rgba(99, 102, 241, 0.3)",
            black: "#0f0e17",
            red: "#ef4444",
            green: "#22c55e",
            yellow: "#f59e0b",
            blue: "#6366f1",
            magenta: "#a78bfa",
            cyan: "#22d3ee",
            white: "#e8e6f0",
          },
          cursorBlink: true,
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        termRef.current = term;
        fitRef.current = fitAddon;

        term.writeln(
          "\x1b[1;34mCodeIn Terminal\x1b[0m — \x1b[2mDesktop app required for interactive shell\x1b[0m",
        );
        term.writeln("");

        // Resize observer
        const observer = new ResizeObserver(() => {
          try {
            fitAddon.fit();
          } catch {}
        });
        observer.observe(containerRef.current);

        return () => observer.disconnect();
      } catch {
        // xterm failed to load
      }
    }

    init();

    return () => {
      mounted = false;
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">TERMINAL</span>
        <button
          className="terminal-close-btn"
          onClick={() => dispatch(toggleTerminal())}
          title="Close terminal"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="terminal-content" ref={containerRef} />
    </div>
  );
}
