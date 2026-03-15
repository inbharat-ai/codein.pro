import {
  ActionReducerMapBuilder,
  AsyncThunk,
  createSlice,
} from "@reduxjs/toolkit";
import { streamResponseThunk } from "../../thunks/streamResponse";
import chatHistoryReducers from "./chatHistoryReducers";
import {
  handleStreamingToolCallUpdates,
  handleToolCallsInMessage,
} from "./helpers";
import {
  selectApplyStateByStreamId,
  selectApplyStateByToolCallId,
} from "./selectors";
import sessionMetadataReducers from "./sessionMetadataReducers";
import streamingReducers from "./streamingReducers";
import toolCallReducers from "./toolCallReducers";
import {
  ChatHistoryItemWithMessageId,
  INITIAL_SESSION_STATE,
  SessionState,
} from "./types";
import uiModeReducers from "./uiModeReducers";

export const sessionSlice = createSlice({
  name: "session",
  initialState: INITIAL_SESSION_STATE,
  reducers: {
    ...chatHistoryReducers,
    ...streamingReducers,
    ...toolCallReducers,
    ...sessionMetadataReducers,
    ...uiModeReducers,
  },
  selectors: {
    selectIsGatheringContext: (state) => {
      const curHistoryItem = state.history.at(-1);
      return curHistoryItem?.isGatheringContext || false;
    },
  },
  extraReducers: (builder) => {
    addPassthroughCases(builder, [streamResponseThunk]);
  },
});

function addPassthroughCases(
  builder: ActionReducerMapBuilder<SessionState>,
  thunks: AsyncThunk<any, any, any>[],
) {
  thunks.forEach((thunk) => {
    builder
      .addCase(thunk.fulfilled, (_state, _action) => {})
      .addCase(thunk.rejected, (_state, _action) => {})
      .addCase(thunk.pending, (_state, _action) => {});
  });
}

// Re-export all action creators
export const {
  // Chat history reducers
  submitEditorAndInitAtIndex,
  truncateHistoryToMessage,
  deleteMessage,
  deleteCompaction,
  updateHistoryItemAtIndex,
  setContextItemsAtIndex,
  addContextItemsAtIndex,
  setAppliedRulesAtIndex,
  addHighlightedCode,
  addPromptCompletionPair,
  clearDanglingMessages,
  setCompactionLoading,
  setInlineErrorMessage,
  setIsPruned,
  setContextPercentage,
  // Streaming reducers
  setActive,
  setInactive,
  setIsGatheringContext,
  abortStream,
  streamUpdate,
  // Tool call reducers
  setToolGenerated,
  updateToolCallOutput,
  setProcessedToolCallArgs,
  cancelToolCall,
  errorToolCall,
  acceptToolCall,
  setToolCallCalling,
  // Session metadata reducers
  newSession,
  updateSessionTitle,
  setIsSessionMetadataLoading,
  setAllSessionMetadata,
  addSessionMetadata,
  updateSessionMetadata,
  deleteSessionMetadata,
  // UI/mode reducers
  setMode,
  setIsInEdit,
  setHasReasoningEnabled,
  updateFileSymbols,
  updateApplyState,
  resetNextCodeBlockToApplyIndex,
  setNewestToolbarPreviewForInput,
  setMainEditorContentTrigger,
  setPendingEditContract,
} = sessionSlice.actions;

export const { selectIsGatheringContext } = sessionSlice.selectors;

// Re-export types, helpers, selectors
export type { ChatHistoryItemWithMessageId, SessionState };
export { handleStreamingToolCallUpdates, handleToolCallsInMessage };
export { INITIAL_SESSION_STATE };
export { selectApplyStateByStreamId, selectApplyStateByToolCallId };

export default sessionSlice.reducer;
