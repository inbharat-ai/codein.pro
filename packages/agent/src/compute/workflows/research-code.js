/**
 * Research + Code — Demo Workflow
 *
 * Pre-configured plan that searches the web, gathers information,
 * synthesises findings, drafts code, and cites sources.
 *
 * NOTE: This workflow enables `allowNetwork` by default because
 * web research requires HTTP access.
 */
"use strict";

const WORKFLOW = {
  name: "research-code",
  title: "Research + Code",
  description:
    "Search the web for information, synthesise findings, draft code, and cite sources",

  goal: "Research the specified topic using web search. Summarise key findings with citations. Then draft working code that applies the research, including inline comments referencing the sources.",

  /** Network required for web research */
  defaultPolicy: {
    allowNetwork: true,
    allowBrowser: false,
    allowFSWrite: true,
    allowRepoWrite: false,
    allowEscalation: true, // may need external AI for better synthesis
    maxSteps: 12,
    maxDurationMs: 600_000, // 10 min
    maxCostUSD: 0.5,
    allowedDomains: [
      "*.stackoverflow.com",
      "*.github.com",
      "*.npmjs.com",
      "*.mdn.mozilla.org",
      "*.docs.python.org",
      "*.developer.mozilla.org",
      "*.wikipedia.org",
    ],
  },

  planTemplate: {
    title: "Research + Code Pipeline",
    steps: [
      {
        description: "Formulate search queries from the user goal",
        agentName: "analyzer",
        tools: [],
      },
      {
        description: "Execute web searches and collect top results",
        agentName: "web-searcher",
        tools: ["webSearch"],
      },
      {
        description: "Read and extract key content from top URLs",
        agentName: "web-reader",
        tools: ["readUrl"],
      },
      {
        description: "Synthesise findings into a structured summary",
        agentName: "analyzer",
        tools: [],
      },
      {
        description: "Identify relevant code patterns and libraries",
        agentName: "analyzer",
        tools: [],
      },
      {
        description: "Read project files to understand current codebase",
        agentName: "file-reader",
        tools: ["readFile", "listDir"],
      },
      {
        description: "Draft implementation code with inline citations",
        agentName: "code-writer",
        tools: ["writeFile"],
      },
      {
        description: "Create a research report artifact with bibliography",
        agentName: "reporter",
        tools: ["writeFile"],
      },
    ],
  },
};

module.exports = WORKFLOW;
