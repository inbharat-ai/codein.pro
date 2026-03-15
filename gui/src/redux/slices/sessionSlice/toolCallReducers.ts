import { PayloadAction } from "@reduxjs/toolkit";
import { ContextItem, McpUiState, Tool } from "core";
import { renderContextItems } from "core/util/messageContent";
import { toolCallCtxItemToCtxItemWithId } from "../../../pages/gui/ToolCallDiv/utils";
import { findChatHistoryItemByToolCallId, findToolCallById } from "../../util";
import { SessionState } from "./types";

const toolCallReducers = {
  setToolGenerated: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
      tools: Tool[];
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );

    if (toolCallState) {
      toolCallState.status = "generated";

      const tool = action.payload.tools.find(
        (t) => t.function.name === toolCallState.toolCall.function.name,
      );
      if (tool) {
        toolCallState.tool = tool;
      }
    }
  },

  updateToolCallOutput: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
      contextItems: ContextItem[];
      mcpUiState?: McpUiState;
    }>,
  ) => {
    // Update tool call state and corresponding tool output message
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.output = action.payload.contextItems;
      toolCallState.mcpUiState = action.payload.mcpUiState;
    }
    const toolItem = findChatHistoryItemByToolCallId(
      state.history,
      action.payload.toolCallId,
    );
    if (toolItem) {
      toolItem.message.content = renderContextItems(
        action.payload.contextItems,
      );
      toolItem.contextItems = action.payload.contextItems.map((item) =>
        toolCallCtxItemToCtxItemWithId(item, action.payload.toolCallId),
      );
    }
  },

  setProcessedToolCallArgs: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
      newArgs: Record<string, any>;
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.processedArgs = action.payload.newArgs;
    }
  },

  cancelToolCall: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.status = "canceled";
    }
  },

  errorToolCall: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
      output?: ContextItem[]; // optional for convenience
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.status = "errored";
      if (action.payload.output) {
        toolCallState.output = action.payload.output;
      }
    }
  },

  acceptToolCall: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.status = "done";
    }
  },

  setToolCallCalling: (
    state: SessionState,
    action: PayloadAction<{
      toolCallId: string;
    }>,
  ) => {
    const toolCallState = findToolCallById(
      state.history,
      action.payload.toolCallId,
    );
    if (toolCallState) {
      toolCallState.status = "calling";
    }
  },
};

export default toolCallReducers;
