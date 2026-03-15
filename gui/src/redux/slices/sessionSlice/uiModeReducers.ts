import { PayloadAction } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/react";
import { ApplyState, FileSymbolMap, MessageModes } from "core";
import { EditContractPayload } from "../../../../../packages/shared/src/index";
import { SessionState } from "./types";

const uiModeReducers = {
  setMode: (state: SessionState, action: PayloadAction<MessageModes>) => {
    state.mode = action.payload;
    state.pendingEditContract = undefined;
  },

  setIsInEdit: (state: SessionState, action: PayloadAction<boolean>) => {
    state.isInEdit = action.payload;
  },

  setHasReasoningEnabled: (
    state: SessionState,
    action: PayloadAction<boolean>,
  ) => {
    state.hasReasoningEnabled = action.payload;
  },

  updateFileSymbols: (
    state: SessionState,
    action: PayloadAction<FileSymbolMap>,
  ) => {
    state.symbols = {
      ...state.symbols,
      ...action.payload,
    };
  },

  updateApplyState: (
    state: SessionState,
    { payload }: PayloadAction<ApplyState>,
  ) => {
    const applyState = state.codeBlockApplyStates.states.find(
      (state) => state.streamId === payload.streamId,
    );

    if (!applyState) {
      state.codeBlockApplyStates.states.push(payload);
    } else {
      applyState.status = payload.status ?? applyState.status;
      applyState.numDiffs = payload.numDiffs ?? applyState.numDiffs;
      applyState.filepath = payload.filepath ?? applyState.filepath;
      applyState.fileContent = payload.fileContent ?? applyState.fileContent;
      applyState.originalFileContent =
        payload.originalFileContent ?? applyState.originalFileContent;
    }

    if (payload.status === "done") {
      state.codeBlockApplyStates.curIndex++;
    }
  },

  resetNextCodeBlockToApplyIndex: (state: SessionState) => {
    state.codeBlockApplyStates.curIndex = 0;
  },

  setNewestToolbarPreviewForInput: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<{
      inputId: string;
      contextItemId: string;
    }>,
  ) => {
    state.newestToolbarPreviewForInput[payload.inputId] = payload.contextItemId;
  },

  // Trigger value picked up by editor with isMainInput to set its content
  setMainEditorContentTrigger: (
    state: SessionState,
    action: PayloadAction<JSONContent | undefined>,
  ) => {
    state.mainEditorContentTrigger = action.payload;
  },

  setPendingEditContract: (
    state: SessionState,
    action: PayloadAction<EditContractPayload | undefined>,
  ) => {
    state.pendingEditContract = action.payload;
  },
};

export default uiModeReducers;
