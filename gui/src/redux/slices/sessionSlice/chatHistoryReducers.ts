import { PayloadAction } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/react";
import {
  ChatHistoryItem,
  ContextItemWithId,
  PromptLog,
  RuleMetadata,
} from "core";
import { findUriInDirs, getUriPathBasename } from "core/util/uri";
import { findLastIndex } from "lodash";
import { v4 as uuidv4 } from "uuid";
import { ChatHistoryItemWithMessageId, SessionState } from "./types";

const chatHistoryReducers = {
  submitEditorAndInitAtIndex: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      index: number;
      editorState: JSONContent;
    }>,
  ) => {
    const { index, editorState } = payload;

    if (state.history.length && index < state.history.length) {
      // Resubmission - update input message, truncate history after resubmit with new empty response message
      if (index % 2 === 1) {
        // Corrupted history: resubmitting at odd index
      }
      const historyItem = state.history[index];

      historyItem.message.content = ""; // IMPORTANT - this is quickly updated by resolveEditorContent based on editor state prior to streaming
      historyItem.editorState = payload.editorState;
      historyItem.contextItems = [];

      state.history = state.history.slice(0, index + 1).concat({
        message: {
          id: uuidv4(),
          role: "assistant",
          content: "", // IMPORTANT - this is subsequently updated by response streaming
        },
        contextItems: [],
      });
    } else {
      // New input/response messages
      state.history = state.history.concat([
        {
          message: {
            id: uuidv4(),
            role: "user",
            content: "", // IMPORTANT - this is quickly updated by resolveEditorContent based on editor state prior to streaming
          },
          contextItems: [],
          editorState,
        },
        {
          message: {
            id: uuidv4(),
            role: "assistant",
            content: "", // IMPORTANT - this is subsequently updated by response streaming
          },
          contextItems: [],
        },
      ]);
    }

    state.isStreaming = true;
  },

  truncateHistoryToMessage: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      index: number;
    }>,
  ) => {
    const { index } = payload;

    if (state.history.length && index < state.history.length) {
      state.codeBlockApplyStates.curIndex = 0;
      state.history = state.history.slice(0, index + 1).concat({
        message: {
          id: uuidv4(),
          role: "assistant",
          content: "", // IMPORTANT - this is subsequently updated by response streaming
        },
        contextItems: [],
      });
      state.inlineErrorMessage = undefined;
      state.isPruned = false;
      state.contextPercentage = undefined;
    }
  },

  deleteMessage: (state: SessionState, action: PayloadAction<number>) => {
    // Deletes the current assistant message and the previous user message
    state.history.splice(action.payload - 1, 2);
    state.inlineErrorMessage = undefined;
    state.isPruned = false;
    state.contextPercentage = undefined;
  },

  deleteCompaction: (state: SessionState, action: PayloadAction<number>) => {
    // Removes the conversation summary from the specified message
    const historyItem = state.history[action.payload];
    if (historyItem?.conversationSummary) {
      state.history[action.payload] = {
        ...historyItem,
        conversationSummary: undefined,
      };
    }
  },

  updateHistoryItemAtIndex: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      index: number;
      updates: Partial<ChatHistoryItemWithMessageId>;
    }>,
  ) => {
    const { index, updates } = payload;
    if (index !== 0 && !state.history[index]) {
      return;
    }
    state.history[index] = {
      ...state.history[index],
      ...updates,
    };
  },

  setContextItemsAtIndex: (
    state: SessionState,
    {
      payload: { index, contextItems },
    }: PayloadAction<{
      index: number;
      contextItems: ChatHistoryItem["contextItems"];
    }>,
  ) => {
    if (state.history[index]) {
      state.history[index].contextItems = contextItems;
    }
  },

  addContextItemsAtIndex: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      index: number;
      contextItems: ContextItemWithId[];
    }>,
  ) => {
    const historyItem = state.history[payload.index];

    if (!historyItem) {
      return;
    }

    historyItem.contextItems = [
      ...historyItem.contextItems,
      ...payload.contextItems,
    ];
  },

  setAppliedRulesAtIndex: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      index: number;
      appliedRules: RuleMetadata[];
    }>,
  ) => {
    if (state.history[payload.index]) {
      state.history[payload.index].appliedRules = payload.appliedRules;
    }
  },

  addHighlightedCode: (
    state: SessionState,
    { payload }: PayloadAction<{ rangeInFileWithContents: any; edit: boolean }>,
  ) => {
    let contextItems =
      state.history[state.history.length - 1].contextItems ?? [];

    contextItems = contextItems.map((item) => {
      return { ...item, editing: false };
    });

    const { relativePathOrBasename } = findUriInDirs(
      payload.rangeInFileWithContents.filepath,
      window.workspacePaths ?? [],
    );
    const fileName = getUriPathBasename(
      payload.rangeInFileWithContents.filepath,
    );

    const lineNums = `(${
      payload.rangeInFileWithContents.range.start.line + 1
    }-${payload.rangeInFileWithContents.range.end.line + 1})`;

    contextItems.push({
      name: `${fileName} ${lineNums}`,
      description: relativePathOrBasename,
      id: {
        providerTitle: "code",
        itemId: uuidv4(),
      },
      content: payload.rangeInFileWithContents.contents,
      editing: true,
      editable: true,
      uri: {
        type: "file",
        value: payload.rangeInFileWithContents.filepath,
      },
    });

    state.history[state.history.length - 1].contextItems = contextItems;
  },

  addPromptCompletionPair: (
    state: SessionState,
    { payload }: PayloadAction<PromptLog[]>,
  ) => {
    if (!state.history.length) {
      return;
    }

    const lastMessage = state.history[state.history.length - 1];

    lastMessage.promptLogs = lastMessage.promptLogs
      ? lastMessage.promptLogs.concat(payload)
      : payload;

    // Inactive thinking for reasoning models when '</think>' tag is not received on request completion
    if (lastMessage.reasoning?.active) {
      lastMessage.reasoning.active = false;
      lastMessage.reasoning.endAt = Date.now();
    }
  },

  clearDanglingMessages: (state: SessionState) => {
    // This is used during cancellation
    // After the last user or tool message, we can have thinking and or valid assitant message (content or generated tool calls) OR nothing.
    // The only thing allowed after the last assistant message that has either content or generated tool calls
    // is a user or tool message
    if (state.history.length < 2) {
      return;
    }

    const lastUserOrToolIdx = findLastIndex(
      state.history,
      (item) => item.message.role === "tool" || item.message.role === "user",
    );

    let validAssistantMessageIdx = -1;
    for (let i = state.history.length - 1; i > lastUserOrToolIdx; i--) {
      const message = state.history[i];
      const hasGeneratedMsg = message.toolCallStates?.some(
        (toolCallState) => toolCallState.status !== "generating",
      );
      if (message.message.content || hasGeneratedMsg) {
        validAssistantMessageIdx = i;
        // Cancel any tool calls that are dangling and generated
        if (message.toolCallStates) {
          message.toolCallStates.forEach((toolCallState) => {
            if (
              toolCallState.status === "generated" ||
              toolCallState.status === "generating"
            ) {
              toolCallState.status = "canceled";
            }
          });
        }
        break;
      }
    }

    if (validAssistantMessageIdx === -1) {
      const lastMsg = state.history[lastUserOrToolIdx];
      const lastRole = lastMsg.message.role as "user" | "tool";
      if (lastRole === "user") {
        state.mainEditorContentTrigger = lastMsg.editorState;
        state.history = state.history.slice(0, lastUserOrToolIdx);
      } else {
        state.history = state.history.slice(0, lastUserOrToolIdx + 1);
      }
    } else {
      state.history = state.history.slice(0, validAssistantMessageIdx + 1);
    }
  },

  setCompactionLoading: (
    state: SessionState,
    action: PayloadAction<{ index: number; loading: boolean }>,
  ) => {
    const { index, loading } = action.payload;
    if (loading) {
      state.compactionLoading[index] = true;
    } else {
      delete state.compactionLoading[index];
    }
  },

  setInlineErrorMessage: (
    state: SessionState,
    action: PayloadAction<SessionState["inlineErrorMessage"]>,
  ) => {
    state.inlineErrorMessage = action.payload;
  },

  setIsPruned: (state: SessionState, action: PayloadAction<boolean>) => {
    state.isPruned = action.payload;
  },

  setContextPercentage: (
    state: SessionState,
    action: PayloadAction<number>,
  ) => {
    state.contextPercentage = action.payload;
  },
};

export default chatHistoryReducers;
