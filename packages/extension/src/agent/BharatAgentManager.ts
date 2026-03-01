import * as path from "node:path";
import * as vscode from "vscode";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";

let agentProcess: ChildProcessWithoutNullStreams | undefined;

export function startCodInAgent(context: vscode.ExtensionContext) {
  if (agentProcess) {
    return;
  }

  const agentEntry = path.join(
    context.extensionPath,
    "..",
    "..",
    "packages",
    "agent",
    "src",
    "index.js",
  );

  agentProcess = spawn(process.execPath, [agentEntry], {
    stdio: "pipe",
    env: {
      ...process.env,
      CODIN_AGENT_PORT: process.env.CODIN_AGENT_PORT || "43120",
    },
  });

  agentProcess.stdout.on("data", (data) => {
    console.log(`[CodIn Agent] ${data.toString().trim()}`);
  });

  agentProcess.stderr.on("data", (data) => {
    console.error(`[CodIn Agent] ${data.toString().trim()}`);
  });

  agentProcess.on("exit", (code) => {
    console.log(`[CodIn Agent] exited with code ${code}`);
    agentProcess = undefined;
  });

  context.subscriptions.push({
    dispose: () => {
      if (agentProcess) {
        agentProcess.kill();
        agentProcess = undefined;
      }
    },
  });
}
