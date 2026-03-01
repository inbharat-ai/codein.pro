/**
 * Terminal Component - Integrated Terminal with xterm
 */

import React, { useEffect, useRef, useState } from "react";
import { Terminal as XTermTerminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import "./Terminal.css";

interface TerminalTab {
  id: string;
  name: string;
  terminalId: string;
  isActive: boolean;
}

export const Terminal: React.FC = () => {
  const [terminals, setTerminals] = useState<TerminalTab[]>([]);
  const [activeTerminalTab, setActiveTerminalTab] = useState<string | null>(
    null,
  );
  const [xtermInstances, setXtermInstances] = useState<
    Map<string, XTermTerminal>
  >(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Create initial terminal
    createNewTerminal();

    return () => {
      // Cleanup
      xtermInstances.forEach((term) => term.dispose());
    };
  }, []);

  const createNewTerminal = async () => {
    try {
      const terminalId = await window.codinAPI.terminal.create();
      const tabId = Date.now().toString();

      const tab: TerminalTab = {
        id: tabId,
        name: `Terminal ${terminals.length + 1}`,
        terminalId,
        isActive: true,
      };

      // Clear previous active
      setTerminals((prev) => prev.map((t) => ({ ...t, isActive: false })));

      setTerminals((prev) => [...prev, tab]);
      setActiveTerminalTab(tabId);

      // Initialize xterm
      const xterm = new XTermTerminal({
        theme: { background: "#1e1e1e", foreground: "#d4d4d4" },
        fontSize: 12,
      });

      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      // Create container
      if (containerRef.current) {
        const div = document.createElement("div");
        div.id = `terminal-${tabId}`;
        div.style.display = activeTerminalTab === tabId ? "block" : "none";
        containerRef.current.appendChild(div);

        xterm.open(div);
        fitAddon.fit();

        // Setup data forwarding
        xterm.onData((data) => {
          window.codinAPI.terminal.write(terminalId, data);
        });

        window.codinAPI.terminal.onData(terminalId, (data: string) => {
          xterm.write(data);
        });

        window.codinAPI.terminal.onExit(terminalId, (code: number) => {
          xterm.write(`\r\nProcess exited with code ${code}\r\n`);
        });

        const newInstances = new Map(xtermInstances);
        newInstances.set(tabId, xterm);
        setXtermInstances(newInstances);

        // Handle window resize
        const resizeListener = () => {
          fitAddon.fit();
          window.codinAPI.terminal.resize(terminalId, xterm.cols, xterm.rows);
        };

        window.addEventListener("resize", resizeListener);
        return () => window.removeEventListener("resize", resizeListener);
      }
    } catch (error) {
      console.error("Failed to create terminal:", error);
    }
  };

  const closeTerminal = (tabId: string) => {
    const tab = terminals.find((t) => t.id === tabId);
    if (tab) {
      window.codinAPI.terminal.kill(tab.terminalId);

      const xterm = xtermInstances.get(tabId);
      if (xterm) {
        xterm.dispose();
        const newInstances = new Map(xtermInstances);
        newInstances.delete(tabId);
        setXtermInstances(newInstances);
      }

      const newTerminals = terminals.filter((t) => t.id !== tabId);
      setTerminals(newTerminals);

      if (activeTerminalTab === tabId && newTerminals.length > 0) {
        setActiveTerminalTab(newTerminals[0].id);
      }
    }
  };

  const switchTerminal = (tabId: string) => {
    setActiveTerminalTab(tabId);
    setTerminals((prev) =>
      prev.map((t) => ({ ...t, isActive: t.id === tabId })),
    );

    // Update visibility
    terminals.forEach((tab) => {
      const el = document.getElementById(`terminal-${tab.id}`);
      if (el) {
        el.style.display = tab.id === tabId ? "block" : "none";
      }
    });
  };

  return (
    <div className="terminal-panel">
      <div className="terminal-tabs">
        {terminals.map((tab) => (
          <div
            key={tab.id}
            className={`terminal-tab ${tab.isActive ? "active" : ""}`}
            onClick={() => switchTerminal(tab.id)}
          >
            <span className="terminal-tab-name">{tab.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(tab.id);
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={createNewTerminal}
          className="terminal-add-button"
          title="New Terminal"
          aria-label="New Terminal"
        >
          +
        </button>
      </div>
      <div className="terminal-content" ref={containerRef} />
    </div>
  );
};
