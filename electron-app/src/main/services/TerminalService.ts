/**
 * Terminal Service
 * Manages terminal sessions using node-pty
 */

import * as pty from "node-pty";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";

interface TerminalSession {
  id: string;
  pty: pty.IPty;
  onDataCallback?: (data: string) => void;
  onExitCallback?: (code: number) => void;
}

export class TerminalService {
  private terminals: Map<string, TerminalSession> = new Map();

  /**
   * Create a new terminal session
   */
  public async create(cwd?: string): Promise<string> {
    const id = uuidv4();
    const shell = this.getDefaultShell();

    const terminal = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: cwd || os.homedir(),
      env: process.env as any,
    });

    const session: TerminalSession = {
      id,
      pty: terminal,
    };

    terminal.onData((data) => {
      if (session.onDataCallback) {
        session.onDataCallback(data);
      }
    });

    terminal.onExit(({ exitCode }) => {
      if (session.onExitCallback) {
        session.onExitCallback(exitCode);
      }
      this.terminals.delete(id);
    });

    this.terminals.set(id, session);
    return id;
  }

  /**
   * Write data to terminal
   */
  public async write(id: string, data: string): Promise<void> {
    const session = this.terminals.get(id);
    if (!session) {
      throw new Error(`Terminal ${id} not found`);
    }
    session.pty.write(data);
  }

  /**
   * Resize terminal
   */
  public async resize(id: string, cols: number, rows: number): Promise<void> {
    const session = this.terminals.get(id);
    if (!session) {
      throw new Error(`Terminal ${id} not found`);
    }
    session.pty.resize(cols, rows);
  }

  /**
   * Kill terminal
   */
  public async kill(id: string): Promise<void> {
    const session = this.terminals.get(id);
    if (!session) {
      return; // Already killed
    }
    session.pty.kill();
    this.terminals.delete(id);
  }

  /**
   * Register data callback
   */
  public onData(id: string, callback: (data: string) => void): void {
    const session = this.terminals.get(id);
    if (session) {
      session.onDataCallback = callback;
    }
  }

  /**
   * Register exit callback
   */
  public onExit(id: string, callback: (code: number) => void): void {
    const session = this.terminals.get(id);
    if (session) {
      session.onExitCallback = callback;
    }
  }

  /**
   * Clean up all terminals
   */
  public cleanupAll(): void {
    for (const [id, session] of this.terminals) {
      session.pty.kill();
    }
    this.terminals.clear();
  }

  /**
   * Get default shell for platform
   */
  private getDefaultShell(): string {
    if (process.platform === "win32") {
      return process.env.COMSPEC || "cmd.exe";
    }
    return process.env.SHELL || "/bin/bash";
  }
}
