import { PayloadAction } from "@reduxjs/toolkit";
import { ChatMessage } from "core";
import { mergeReasoningDetails } from "core/llm/openaiTypeConverters";
import { renderChatMessage } from "core/util/messageContent";
import { v4 as uuidv4 } from "uuid";
import {
  handleStreamingToolCallUpdates,
  handleToolCallsInMessage,
} from "./helpers";
import { ChatHistoryItemWithMessageId, SessionState } from "./types";

const streamingReducers = {
  setActive: (state: SessionState) => {
    state.isStreaming = true;
  },

  setInactive: (state: SessionState) => {
    const curMessage = state.history.at(-1);

    if (curMessage) {
      curMessage.isGatheringContext = false;
    }

    state.isStreaming = false;
  },

  setIsGatheringContext: (
    state: SessionState,
    { payload }: PayloadAction<boolean>,
  ) => {
    const curMessage = state.history.at(-1);
    if (curMessage) {
      curMessage.isGatheringContext = payload;
    }
  },

  abortStream: (state: SessionState) => {
    state.streamAborter.abort();
    state.streamAborter = new AbortController();
  },

  streamUpdate: (state: SessionState, action: PayloadAction<ChatMessage[]>) => {
    if (state.history.length) {
      for (const message of action.payload) {
        let lastItem = state.history[state.history.length - 1];
        let lastMessage = lastItem.message;

        if (message.role === "thinking" && message.redactedThinking) {
          state.history.push({
            message: {
              role: "thinking",
              content: "internal reasoning is hidden due to safety reasons",
              redactedThinking: message.redactedThinking,
              id: uuidv4(),
            },
            contextItems: [],
          });
          continue;
        }

        const messageContent = message.content
          ? renderChatMessage(message)
          : "";

        // OpenAI-compatible models in agent mode sometimes send
        // all of their data in one message, so we handle that case early.
        if (messageContent && message.role !== "tool") {
          const thinkMatches = messageContent.match(
            /<think>([\s\S]*)<\/think>([\s\S]*)/,
          );
          if (thinkMatches) {
            // The order that they seem to consistently use is:
            //
            // <think>Thinking text</think>
            // Text to show to the user

            lastItem.reasoning = {
              text: thinkMatches[1].trim(),
              startAt: Date.now(),
              endAt: Date.now(),
              active: false,
            };

            // This is the chat message that we should show to the user.
            // We always need to push this even if it is empty,
            // because we cannot attach tool calls to a Thinking message.
            // That would break `messageHasToolCallId`.
            state.history.push({
              message: {
                role: "assistant",
                content: thinkMatches[2].trim(),
                id: uuidv4(),
              },
              contextItems: [],
            });
            lastItem = state.history[state.history.length - 1];
            lastMessage = lastItem.message;

            handleToolCallsInMessage(message, lastItem);

            return;
          }
        }

        // The remainder of this function handles streaming messages
        if (
          lastMessage.role !== message.role ||
          message.role === "tool" // Tool messages should always create new messages
        ) {
          // Create a new message
          const historyItem: ChatHistoryItemWithMessageId = {
            message: {
              ...message,
              content: "", // Start with empty content, let accumulation logic handle it
              id: uuidv4(),
            },
            contextItems: [],
          };
          state.history.push(historyItem);
          lastItem = state.history[state.history.length - 1];
          lastMessage = lastItem.message;
        }

        // Add to the existing message
        if (messageContent) {
          if (messageContent.includes("<think>") && message.role !== "tool") {
            lastItem.reasoning = {
              startAt: Date.now(),
              active: true,
              text: messageContent.replace("<think>", "").trim(),
            };
          } else if (
            lastItem.reasoning?.active &&
            messageContent.includes("</think>")
          ) {
            const [reasoningEnd, answerStart] =
              messageContent.split("</think>");
            lastItem.reasoning.text += reasoningEnd.trimEnd();
            lastItem.reasoning.active = false;
            lastItem.reasoning.endAt = Date.now();
            lastMessage.content += answerStart.trimStart();
          } else if (lastItem.reasoning?.active) {
            if (
              lastItem.reasoning.text.length > 0 ||
              messageContent.trim().length > 0
            ) {
              lastItem.reasoning.text += messageContent;
            }
          } else {
            // Note this only works because new message above
            // was already rendered from parts to string
            if (
              lastMessage.content.length > 0 ||
              messageContent.trim().length > 0
            ) {
              lastMessage.content += messageContent;
            }
          }
        } else if (message.role === "thinking" && message.signature) {
          if (lastMessage.role === "thinking") {
            lastMessage.signature = message.signature;
          }
        } else if (
          message.role === "assistant" &&
          message.toolCalls?.length &&
          lastMessage.role === "assistant"
        ) {
          handleStreamingToolCallUpdates(message, lastItem);
        }

        // Attach Responses API output item id to the current assistant message if present
        // fromResponsesChunk sets message.metadata.responsesOutputItemId when it sees output_item.added for messages
        if (
          message.role === "assistant" &&
          lastMessage.role === "assistant" &&
          message.metadata?.responsesOutputItemId
        ) {
          lastMessage.metadata = lastMessage.metadata || {};
          // Accumulate fc_ IDs for parallel tool calls (OpenAI Responses API)
          if (!lastMessage.metadata.responsesOutputItemIds) {
            lastMessage.metadata.responsesOutputItemIds = [];
          }
          (lastMessage.metadata.responsesOutputItemIds as string[]).push(
            message.metadata.responsesOutputItemId as string,
          );
          // Also keep singular for backwards compatibility
          lastMessage.metadata.responsesOutputItemId = message.metadata
            .responsesOutputItemId as string;
        }

        if (
          message.role === "thinking" &&
          message.reasoning_details &&
          lastMessage.role === "thinking"
        ) {
          lastMessage.reasoning_details = mergeReasoningDetails(
            lastMessage.reasoning_details,
            message.reasoning_details,
          );
        }
      }
    }
  },
};

export default streamingReducers;
