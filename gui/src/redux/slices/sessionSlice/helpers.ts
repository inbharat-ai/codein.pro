import {
  AssistantChatMessage,
  ChatMessage,
  ThinkingChatMessage,
  ToolCallDelta,
  ToolCallState,
} from "core";
import { isEditTool } from "../../../util/toolCallState";
import { addToolCallDeltaToState } from "../../../util/toolCallState";
import { ChatHistoryItemWithMessageId } from "./types";

/**
 * Helper function to filter out duplicate edit/search-replace tool calls.
 * Only keeps the first occurrence of edit tools.
 *
 * We don't support multiple parallel apply calls - see tool definitions for
 * instructions we provide to models to prevent this behavior.
 */
export function filterMultipleEditToolCalls(
  toolCalls: ToolCallDelta[],
): ToolCallDelta[] {
  let hasSeenEditTool = false;

  return toolCalls.filter((toolCall) => {
    if (toolCall.function?.name && isEditTool(toolCall.function?.name)) {
      if (hasSeenEditTool) {
        return false; // Skip this duplicate edit tool
      }
      hasSeenEditTool = true;
    }

    return true;
  });
}

/**
 * Initializes tool call states for a new message containing tool calls.
 * This function is called when we receive a complete message with tool calls,
 * typically in non-streaming scenarios or when processing the first chunk
 * of a streaming message that contains tool calls.
 *
 * @param message - The chat message containing tool calls to process
 * @param lastItem - The chat history item to attach tool call states to
 */
export function handleToolCallsInMessage(
  message: ChatMessage,
  lastItem: ChatHistoryItemWithMessageId,
): void {
  if (
    (message.role === "assistant" || message.role === "thinking") &&
    message.toolCalls?.length
  ) {
    // Filter out duplicate edit/search-replace tool calls - only keep the first one
    const filteredToolCalls = filterMultipleEditToolCalls(message.toolCalls);

    // Initialize tool call states for each filtered tool call in the message
    // Each tool call gets its own state to track generation/execution progress
    lastItem.toolCallStates = filteredToolCalls.map((toolCallDelta) =>
      addToolCallDeltaToState(toolCallDelta, undefined),
    );

    // Update the message's toolCalls array to reflect the processed tool calls
    // We can safely cast because we verified the role above
    const curMessage = lastItem.message as
      | AssistantChatMessage
      | ThinkingChatMessage;
    curMessage.toolCalls = lastItem.toolCallStates.map(
      (state) => state.toolCall,
    );
  }
}

/**
 * Applies a single tool call delta to the tool call states array.
 *
 * This function handles the core logic for OpenAI-style tool call streaming where:
 * - Initial tool calls come with full details (ID, name, arguments)
 * - Subsequent argument fragments come without IDs and need to update the most recent tool call
 * - Multiple parallel tool calls can be streamed simultaneously
 *
 * @param toolCallDelta - The incoming tool call delta from the LLM stream
 * @param toolCallStates - Array of existing tool call states (modified in place)
 */
export function applyToolCallDelta(
  toolCallDelta: ToolCallDelta,
  toolCallStates: ToolCallState[],
): void {
  // Find existing state by matching toolCallId - this ensures we update
  // the correct tool call even when multiple tool calls are being streamed
  let existingStateIndex = -1;

  if (toolCallDelta.id) {
    // Tool call has an ID - find by exact match
    // This handles: new tool calls or explicit updates to existing ones
    existingStateIndex = toolCallStates.findIndex(
      (state) => state.toolCallId === toolCallDelta.id,
    );
  } else {
    // No ID in delta (common in OpenAI streaming fragments)
    // Strategy: Update the most recently added tool call that's still being generated
    // This handles the pattern: initial tool call with ID, then fragments without ID
    existingStateIndex = toolCallStates.length - 1;

    // Ensure we have at least one tool call to update
    if (existingStateIndex < 0) {
      existingStateIndex = -1; // Will create new tool call
    }
  }

  const existingState =
    existingStateIndex >= 0 ? toolCallStates[existingStateIndex] : undefined;

  // Apply the delta to create an updated state (either updating existing or creating new)
  const updatedState = addToolCallDeltaToState(toolCallDelta, existingState);

  if (existingStateIndex >= 0) {
    // Update existing tool call state in place
    toolCallStates[existingStateIndex] = updatedState;
  } else {
    // Add new tool call state for a newly discovered tool call
    toolCallStates.push(updatedState);
  }
}

/**
 * Handles incremental updates to tool calls during streaming responses.
 * This function processes streaming deltas for tool calls, updating existing
 * tool call states or creating new ones as needed. It uses ID-based matching
 * to ensure tool call updates are applied to the correct tool call state.
 *
 * @param message - The streaming message chunk containing tool call deltas
 * @param lastItem - The chat history item containing existing tool call states
 */
export function handleStreamingToolCallUpdates(
  message: ChatMessage,
  lastItem: ChatHistoryItemWithMessageId,
): void {
  if (
    message.role === "assistant" &&
    message.toolCalls?.length &&
    lastItem.message.role === "assistant"
  ) {
    // Start with existing tool call states or empty array if none exist
    const existingToolCallStates = lastItem.toolCallStates || [];
    const updatedToolCallStates: ToolCallState[] = [...existingToolCallStates];

    // Filter out duplicate edit/search-replace tool calls - only keep the first one
    const filteredToolCalls = filterMultipleEditToolCalls(message.toolCalls);

    // Process each filtered tool call delta, matching by ID to update the correct state
    filteredToolCalls.forEach((toolCallDelta) => {
      applyToolCallDelta(toolCallDelta, updatedToolCallStates);
    });

    // Replace the entire tool call states array with the updated version
    lastItem.toolCallStates = updatedToolCallStates;

    // Update the message's toolCalls array to reflect current tool call states
    (lastItem.message as any).toolCalls = updatedToolCallStates.map(
      (state) => state.toolCall,
    );
  }
}
