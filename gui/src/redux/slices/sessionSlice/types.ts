import { PayloadAction } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/react";
import {
  ApplyState,
  BaseSessionMetadata,
  ChatHistoryItem,
  ChatMessage,
  FileSymbolMap,
  MessageModes,
} from "core";
import { EditContractPayload } from "../../../../../packages/shared/src/index";
import type { RemoteSessionMetadata } from "core/control-plane/client";
import { NEW_SESSION_TITLE } from "core/util/constants";
import { v4 as uuidv4 } from "uuid";
import { type InlineErrorMessageType } from "../../../components/mainInput/InlineErrorMessage";

// We need this to handle reorderings (e.g. a mid-array deletion) of the messages array.
// The proper fix is adding a UUID to all chat messages, but this is the temp workaround.
export type ChatHistoryItemWithMessageId = ChatHistoryItem & {
  message: ChatMessage & { id: string };
};

export type SessionState = {
  lastSessionId?: string;
  isSessionMetadataLoading: boolean;
  allSessionMetadata: (BaseSessionMetadata | RemoteSessionMetadata)[];
  history: ChatHistoryItemWithMessageId[];
  isStreaming: boolean;
  title: string;
  id: string;
  streamAborter: AbortController;
  mainEditorContentTrigger?: JSONContent | undefined;
  symbols: FileSymbolMap;
  mode: MessageModes;
  isInEdit: boolean;
  codeBlockApplyStates: {
    states: ApplyState[];
    curIndex: number;
  };
  newestToolbarPreviewForInput: Record<string, string>;
  hasReasoningEnabled?: boolean;
  isPruned?: boolean;
  contextPercentage?: number;
  inlineErrorMessage?: InlineErrorMessageType;
  compactionLoading: Record<number, boolean>; // Track compaction loading by message index
  pendingEditContract?: EditContractPayload;
};

export const INITIAL_SESSION_STATE: SessionState = {
  isSessionMetadataLoading: false,
  allSessionMetadata: [],
  history: [],
  isStreaming: false,
  title: NEW_SESSION_TITLE,
  id: uuidv4(),
  streamAborter: new AbortController(),
  symbols: {},
  mode: "ask",
  isInEdit: false,
  codeBlockApplyStates: {
    states: [],
    curIndex: 0,
  },
  lastSessionId: undefined,
  newestToolbarPreviewForInput: {},
  compactionLoading: {},
  pendingEditContract: undefined,
};

// Re-export PayloadAction for use by reducer files
export type { PayloadAction };
