/**
 * Fix Build — Demo Workflow
 *
 * Pre-configured plan that finds test/build failures, diagnoses root cause,
 * proposes a fix, generates a diff artifact.
 */
"use strict";

const WORKFLOW = {
  name: "fix-build",
  title: "Fix My Build",
  description:
    "Run tests / build, capture errors, diagnose root cause, propose a fix, create a diff artifact",

  /** Default goal. User may override via POST body. */
  goal: "Run the project tests, find every failing test, diagnose the root cause for each failure, propose minimal fixes, and create diff artifacts for the changes.",

  /** Fail-closed: no network or external AI needed for local build fixing */
  defaultPolicy: {
    allowNetwork: false,
    allowBrowser: false,
    allowFSWrite: true,
    allowRepoWrite: false,
    allowEscalation: false,
    maxSteps: 10,
    maxDurationMs: 300_000, // 5 min
    maxCostUSD: 0,
  },

  /**
   * Pre-built plan.  If provided the planner may skip LLM-based planning
   * and use this template directly (filling in project-specific details).
   */
  planTemplate: {
    title: "Fix Build Pipeline",
    steps: [
      {
        description:
          "Discover project structure (package.json, test config, etc.)",
        agentName: "file-reader",
        tools: ["readFile", "listDir"],
      },
      {
        description: "Run the full test / build command and capture output",
        agentName: "terminal-runner",
        tools: ["runTerminalCommand"],
      },
      {
        description: "Parse error output to identify failing tests / files",
        agentName: "analyzer",
        tools: [],
      },
      {
        description: "Read source files related to failures",
        agentName: "file-reader",
        tools: ["readFile", "searchFiles"],
      },
      {
        description: "Diagnose root cause for each failure",
        agentName: "analyzer",
        tools: [],
      },
      {
        description: "Generate minimal fix patches (diff artifacts)",
        agentName: "code-writer",
        tools: ["writeFile"],
      },
      {
        description: "Verify fix by re-running tests (if possible)",
        agentName: "terminal-runner",
        tools: ["runTerminalCommand"],
      },
      {
        description: "Create summary report artifact",
        agentName: "reporter",
        tools: ["writeFile"],
      },
    ],
  },
};

module.exports = WORKFLOW;
