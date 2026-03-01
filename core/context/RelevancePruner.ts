/**
 * RelevancePruner — Scores chat messages by relevance to the current query,
 * enabling smarter pruning than simple chronological removal.
 *
 * Scoring factors:
 *   1. Recency (newer = higher)
 *   2. Content overlap with current query (keyword/token similarity)
 *   3. Role priority (user/assistant > system > tool results)
 *   4. Code density (messages with code blocks are more valuable)
 *   5. Conversation flow (preserves Q/A pairs together)
 */

import { ChatMessage, MessageContent } from "../index.js";

export interface ScoredMessage {
  index: number;
  message: ChatMessage;
  relevanceScore: number;
  breakdown: {
    recency: number;
    contentOverlap: number;
    rolePriority: number;
    codeDensity: number;
    flowBonus: number;
  };
}

export interface PruneResult {
  kept: ChatMessage[];
  pruned: ChatMessage[];
  tokensSaved: number;
  keptIndices: number[];
  prunedIndices: number[];
}

/**
 * Extract plain text from a ChatMessage's content.
 */
function extractText(content: MessageContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text ?? "")
      .join(" ");
  }
  return "";
}

/**
 * Simple keyword extraction: lowercase, split on whitespace/punctuation,
 * filter short tokens and stop words.
 */
function extractKeywords(text: string): Set<string> {
  const STOP_WORDS = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "our",
    "their",
    "and",
    "but",
    "or",
    "nor",
    "not",
    "so",
    "yet",
    "both",
    "either",
    "neither",
    "each",
    "every",
    "all",
    "any",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "only",
    "own",
    "same",
    "than",
    "too",
    "very",
  ]);

  const tokens = text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(Boolean);
  const keywords = new Set<string>();
  for (const token of tokens) {
    if (token.length >= 3 && !STOP_WORDS.has(token)) {
      keywords.add(token);
    }
  }
  return keywords;
}

/**
 * Jaccard similarity between two keyword sets.
 */
function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Estimate code density: ratio of lines containing code-like patterns.
 */
function codeDensity(text: string): number {
  if (!text) return 0;
  const lines = text.split("\n");
  if (lines.length === 0) return 0;

  const codePatterns =
    /[{}\[\]();=<>]|function |class |const |let |var |import |export |def |return |if |for |while /;
  const codeLineCount = lines.filter((l) => codePatterns.test(l)).length;
  // Also count ```-fenced blocks
  const fencedBlocks = (text.match(/```/g) || []).length / 2;
  const fencedBonus = Math.min(0.3, fencedBlocks * 0.1);
  return Math.min(1, codeLineCount / lines.length + fencedBonus);
}

/**
 * Score messages by relevance to the current query.
 */
export function scoreMessages(
  messages: ChatMessage[],
  currentQuery: string,
): ScoredMessage[] {
  const queryKeywords = extractKeywords(currentQuery);
  const totalMessages = messages.length;

  return messages.map((message, index) => {
    const text = extractText(message.content);
    const msgKeywords = extractKeywords(text);

    // 1. Recency: exponential decay, most recent = 1.0
    const position = index / Math.max(1, totalMessages - 1);
    const recency = Math.pow(position, 0.5); // sqrt curve: gentler decay for older messages

    // 2. Content overlap with current query
    const contentOverlap = keywordOverlap(queryKeywords, msgKeywords);

    // 3. Role priority
    const ROLE_WEIGHTS: Record<string, number> = {
      system: 1.0, // system is always kept by compileChatMessages, but high score anyway
      user: 0.8,
      assistant: 0.7,
      tool: 0.4,
      thinking: 0.3,
    };
    const rolePriority = ROLE_WEIGHTS[message.role] ?? 0.5;

    // 4. Code density
    const codeDens = codeDensity(text);

    // 5. Flow bonus: user/assistant pairs should stay together
    let flowBonus = 0;
    if (
      index > 0 &&
      message.role === "assistant" &&
      messages[index - 1]?.role === "user"
    ) {
      flowBonus = 0.15;
    }
    if (
      index < totalMessages - 1 &&
      message.role === "user" &&
      messages[index + 1]?.role === "assistant"
    ) {
      flowBonus = 0.15;
    }

    // Composite score (weighted sum)
    const relevanceScore =
      recency * 0.3 +
      contentOverlap * 0.3 +
      rolePriority * 0.15 +
      codeDens * 0.15 +
      flowBonus * 0.1;

    return {
      index,
      message,
      relevanceScore,
      breakdown: {
        recency,
        contentOverlap,
        rolePriority,
        codeDensity: codeDens,
        flowBonus,
      },
    };
  });
}

/**
 * Prune messages by relevance until the total token count fits within budget.
 * Preserves the system message and the last user/tool sequence.
 *
 * @param messages - ALL chat messages (system included)
 * @param currentQuery - The current user query for relevance scoring
 * @param tokenCounter - Function that returns token count for a message
 * @param maxInputTokens - Maximum input tokens available
 * @returns PruneResult with kept/pruned messages
 */
export function pruneByRelevance(
  messages: ChatMessage[],
  currentQuery: string,
  tokenCounter: (msg: ChatMessage) => number,
  maxInputTokens: number,
): PruneResult {
  // Separate system message (always kept)
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  // The last message is always kept (it's the current user input)
  const lastMsg = nonSystem[nonSystem.length - 1];
  const middleMessages = nonSystem.slice(0, -1);

  // Score the middle messages
  const scored = scoreMessages(middleMessages, currentQuery);

  // Sort by relevance (ascending — least relevant first for pruning)
  const sortedByRelevance = [...scored].sort(
    (a, b) => a.relevanceScore - b.relevanceScore,
  );

  // Calculate current total
  let totalTokens = 0;
  if (systemMsg) totalTokens += tokenCounter(systemMsg);
  totalTokens += tokenCounter(lastMsg);
  for (const msg of middleMessages) {
    totalTokens += tokenCounter(msg);
  }

  // Prune least-relevant messages until within budget
  const prunedIndices = new Set<number>();
  let tokensSaved = 0;

  for (const item of sortedByRelevance) {
    if (totalTokens <= maxInputTokens) break;

    // Don't prune if it's part of a tool call pair
    const msg = item.message;
    if (msg.role === "tool") {
      // Find the assistant message with the matching tool call
      // Skip pruning tool messages to avoid orphans
      continue;
    }

    const msgTokens = tokenCounter(msg);
    prunedIndices.add(item.index);
    totalTokens -= msgTokens;
    tokensSaved += msgTokens;

    // If pruning an assistant message with tool calls, also prune its tool responses
    if (msg.role === "assistant" && "toolCalls" in msg && msg.toolCalls) {
      const toolCallIds = new Set(msg.toolCalls.map((tc: any) => tc.id));
      for (const otherScored of scored) {
        if (
          otherScored.message.role === "tool" &&
          "toolCallId" in otherScored.message &&
          toolCallIds.has(otherScored.message.toolCallId)
        ) {
          if (!prunedIndices.has(otherScored.index)) {
            prunedIndices.add(otherScored.index);
            const otherTokens = tokenCounter(otherScored.message);
            totalTokens -= otherTokens;
            tokensSaved += otherTokens;
          }
        }
      }
    }
  }

  // Reconstruct kept/pruned arrays
  const kept: ChatMessage[] = [];
  const pruned: ChatMessage[] = [];
  const keptIndices: number[] = [];
  const prunedIndicesArr: number[] = [];

  if (systemMsg) {
    kept.push(systemMsg);
    keptIndices.push(-1); // system doesn't have a middle index
  }

  for (let i = 0; i < middleMessages.length; i++) {
    if (prunedIndices.has(i)) {
      pruned.push(middleMessages[i]);
      prunedIndicesArr.push(i);
    } else {
      kept.push(middleMessages[i]);
      keptIndices.push(i);
    }
  }

  kept.push(lastMsg);
  keptIndices.push(middleMessages.length);

  return {
    kept,
    pruned,
    tokensSaved,
    keptIndices,
    prunedIndices: prunedIndicesArr,
  };
}
