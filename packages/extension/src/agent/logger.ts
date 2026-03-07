/**
 * Simple logger for VS Code extension
 */

import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | null = null;

export function initializeLogger() {
  outputChannel = vscode.window.createOutputChannel("CodIn Agent");
}

export const logger = {
  info: (message: string, data?: any) => {
    const formatted = data ? `${message}: ${JSON.stringify(data)}` : message;
    if (outputChannel) {
      outputChannel.appendLine(`[INFO] ${formatted}`);
    } else {
      console.log(formatted);
    }
  },

  error: (message: string, error?: any) => {
    const formatted = error
      ? `${message}: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      : message;
    if (outputChannel) {
      outputChannel.appendLine(`[ERROR] ${formatted}`);
    } else {
      console.error(formatted);
    }
  },

  warn: (message: string, data?: any) => {
    const formatted = data ? `${message}: ${JSON.stringify(data)}` : message;
    if (outputChannel) {
      outputChannel.appendLine(`[WARN] ${formatted}`);
    } else {
      console.warn(formatted);
    }
  },

  debug: (message: string, data?: any) => {
    const formatted = data ? `${message}: ${JSON.stringify(data)}` : message;
    if (outputChannel) {
      outputChannel.appendLine(`[DEBUG] ${formatted}`);
    } else {
      console.debug(formatted);
    }
  },

  show: () => {
    if (outputChannel) {
      outputChannel.show();
    }
  },
};
