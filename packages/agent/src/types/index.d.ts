/**
 * CodIn Backend Type Definitions
 *
 * Canonical type definitions for the CodIn agent runtime.
 * These types are shared across JS and TS modules via JSDoc @type references
 * and direct TS imports. This is NOT a full TS migration — it's a type layer
 * that existing JS code can opt into incrementally.
 *
 * Usage in JS files:
 *   /** @type {import('../types').ProviderDefinition} *​/
 *   const provider = { ... };
 *
 * Usage in TS files:
 *   import type { ProviderDefinition } from '../types';
 */

// ─── Provider Types ──────────────────────────

/** Provider capability flags */
export type ProviderCapability =
  | "chat"
  | "streaming"
  | "function_calling"
  | "vision"
  | "reasoning"
  | "code"
  | "embeddings";

/** Provider definition */
export interface ProviderDefinition {
  id: string;
  displayName: string;
  authType: "bearer" | "query";
  baseUrl: string;
  compatibilityMode: "openai" | "gemini";
  modelDiscovery: "api" | "static";
  capabilities: ProviderCapability[];
  streaming: boolean;
  description: string;
}

/** Provider health status */
export interface ProviderHealth {
  status: "unknown" | "healthy" | "error" | "untested";
  lastCheck: number | null;
  latencyMs: number | null;
  error: string | null;
}

/** Provider with runtime state (combines definition + health) */
export interface ProviderStatus extends ProviderDefinition {
  health: ProviderHealth;
  hasKey: boolean;
  modelCount: number;
}

// ─── Model Types ──────────────────────────

/** Normalized model record */
export interface NormalizedModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number | null;
  pricing: { input: number | null; output: number | null } | null;
  capabilities: ProviderCapability[];
}

/** Model routing preference */
export interface ModelRoutingPreference {
  taskType: string;
  preferredProvider: string;
  preferredModel: string;
  fallbackProvider: string | null;
  fallbackModel: string | null;
}

// ─── Chat / Completion Types ──────────────────────────

/** Chat message role */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** Chat message */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

/** Normalized chat completion response */
export interface ChatCompletionResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

/** Normalized streaming chunk */
export interface StreamChunk {
  content: string;
  done: boolean;
  finishReason: string | null;
}

// ─── MAS (Multi-Agent Swarm) Types ──────────────────────────

/** Swarm topology */
export type SwarmTopology = "mesh" | "hierarchical" | "ring" | "star";

/** Agent status */
export type AgentStatus = "idle" | "busy" | "error" | "terminated";

/** Agent descriptor */
export interface AgentDescriptor {
  id: string;
  type: string;
  status: AgentStatus;
  modelHint: string | null;
  metrics: AgentMetrics;
}

/** Agent performance metrics */
export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  toolCalls: number;
  tokensUsed: number;
  costUSD: number;
  totalTimeMs: number;
  approvalsRequested: number;
}

/** Swarm configuration */
export interface SwarmConfig {
  topology: SwarmTopology;
  maxAgents: number;
  budgetUSD: number;
  timeoutMs: number;
  language: string;
}

/** Swarm state summary */
export interface SwarmState {
  state: "idle" | "running" | "paused" | "error";
  agents: AgentDescriptor[];
  activeTasks: number;
  config: SwarmConfig;
}

// ─── Task Types ──────────────────────────

/** Task node status values */
export type TaskNodeStatusValue =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Task status */
export interface TaskStatus {
  id: string;
  goal: string;
  status: TaskNodeStatusValue;
  nodes: TaskNodeStatus[];
  metadata: TaskMetadata;
}

/** Task node status */
export interface TaskNodeStatus {
  id: string;
  goal: string;
  status: string;
  agentType: string;
  result: any;
}

/** Task metadata */
export interface TaskMetadata {
  startedAt: string;
  completedAt: string | null;
  nodesTotal: number;
  nodesCompleted: number;
  nodesFailed: number;
  costUSD: number;
}

// ─── Permission Types ──────────────────────────

/** Permission action */
export type PermissionAction =
  | "read"
  | "write"
  | "execute"
  | "delete"
  | "network";

/** Permission request */
export interface PermissionRequest {
  id: string;
  agentId: string;
  type: string;
  resource: string;
  action: PermissionAction | string;
  timestamp: string;
}

/** Permission decision */
export interface PermissionDecision {
  granted: boolean;
  reason: string;
  permanent: boolean;
}

// ─── Rate Limiting Types ──────────────────────────

/** Rate limiter result */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

// ─── Event Types ──────────────────────────

/** Swarm event type */
export type SwarmEventType =
  | "task:created"
  | "task:started"
  | "task:completed"
  | "task:failed"
  | "agent:spawned"
  | "agent:released"
  | "agent:error"
  | "permission:requested"
  | "permission:granted"
  | "permission:denied"
  | "swarm:initialized"
  | "swarm:shutdown"
  | "budget:warning"
  | "budget:exceeded";

/** Swarm event */
export interface SwarmEvent {
  id: string;
  type: SwarmEventType | string;
  timestamp: string;
  data: Record<string, any>;
}

// ─── Terminal Types ──────────────────────────

/** Terminal execution result */
export interface TerminalExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ─── Git Types ──────────────────────────

/** Git file status */
export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

/** Git status response */
export interface GitStatus {
  branch: string;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
  clean: boolean;
}

/** Git commit result */
export interface GitCommitResult {
  hash: string;
  message: string;
}

// ─── Security Types ──────────────────────────

/** JWT payload */
export interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
  scope: string[];
}

/** Audit log entry */
export interface AuditEntry {
  timestamp: string;
  action: string;
  agentId: string | null;
  resource: string;
  outcome: "success" | "denied" | "error";
  metadata: Record<string, any>;
}

// ─── Route Handler Types ──────────────────────────

/** Standard API error response */
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, any>;
}

/** Standard API success response */
export interface ApiSuccess<T = any> {
  success: true;
  data: T;
}

/** Paginated response */
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
