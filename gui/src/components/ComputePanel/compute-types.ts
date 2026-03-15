/** Shared types for the Compute panel. */

export interface Step {
  id: string;
  status: string;
  description: string;
  agentName: string;
  confidence: number | null;
  model: string | null;
  output?: string;
  outputTranslated?: string;
  error?: string;
  escalated?: boolean;
}

export interface Artifact {
  id: string;
  type: string;
  name?: string;
  fileName: string;
  size: number;
  createdAt?: string;
}

export interface Job {
  id: string;
  status: string;
  goal: string;
  goalOriginal?: string;
  language: string;
  plan: string | null;
  steps: Step[];
  artifacts: Artifact[];
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
    stepId?: string;
  }>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: {
    tokensUsed: number;
    totalCostEstimate: number;
    modelsUsed: string[];
    escalationCount: number;
  };
  policy: Record<string, unknown>;
}

export interface Workflow {
  name: string;
  icon: string;
  title: string;
  description: string;
}

export const DEMO_WORKFLOWS: Workflow[] = [
  {
    name: "fix-build",
    icon: "Fix",
    title: "Fix My Build",
    description:
      "Run tests, find failures, propose a fix, create a diff artifact",
  },
  {
    name: "feature-spec",
    icon: "Spec",
    title: "Feature Spec + Plan",
    description:
      "Generate a feature specification document and implementation plan",
  },
  {
    name: "research-code",
    icon: "Search",
    title: "Research + Code",
    description:
      "Search the web, gather info, draft code, cite sources (requires network)",
  },
];
