/**
 * Feature Spec — Demo Workflow
 *
 * Pre-configured plan that generates a feature specification document
 * with requirements, acceptance criteria, and an implementation plan.
 */
"use strict";

const WORKFLOW = {
  name: "feature-spec",
  title: "Feature Spec + Plan",
  description:
    "Generate a feature specification with requirements, acceptance criteria, architecture notes, and implementation steps",

  goal: "Create a comprehensive feature specification document. Include: problem statement, user stories, acceptance criteria, API design (if relevant), architecture notes, and a step-by-step implementation plan with estimated effort.",

  defaultPolicy: {
    allowNetwork: false,
    allowBrowser: false,
    allowFSWrite: true,
    allowRepoWrite: false,
    allowEscalation: false,
    maxSteps: 8,
    maxDurationMs: 180_000, // 3 min
    maxCostUSD: 0,
  },

  planTemplate: {
    title: "Feature Spec Pipeline",
    steps: [
      {
        description: "Understand project structure and existing patterns",
        agentName: "file-reader",
        tools: ["readFile", "listDir", "searchFiles"],
      },
      {
        description: "Identify related components and modules",
        agentName: "analyzer",
        tools: ["searchFiles"],
      },
      {
        description: "Draft problem statement and user stories",
        agentName: "code-writer",
        tools: [],
      },
      {
        description: "Define acceptance criteria and constraints",
        agentName: "code-writer",
        tools: [],
      },
      {
        description: "Draft API / interface design",
        agentName: "code-writer",
        tools: [],
      },
      {
        description: "Create architecture notes with dependency map",
        agentName: "analyzer",
        tools: [],
      },
      {
        description:
          "Build step-by-step implementation plan with effort estimates",
        agentName: "code-writer",
        tools: [],
      },
      {
        description: "Write final specification document artifact",
        agentName: "reporter",
        tools: ["writeFile"],
      },
    ],
  },
};

module.exports = WORKFLOW;
