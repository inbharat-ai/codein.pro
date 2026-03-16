import { PayloadAction } from "@reduxjs/toolkit";
import { BaseSessionMetadata, Session } from "core";
import type { RemoteSessionMetadata } from "core/control-plane/client";
import { NEW_SESSION_TITLE } from "core/util/constants";
import { v4 as uuidv4 } from "uuid";
import { ChatHistoryItemWithMessageId, SessionState } from "./types";

const sessionMetadataReducers = {
  newSession: (
    state: SessionState,
    { payload }: PayloadAction<Session | undefined>,
  ) => {
    state.lastSessionId = state.id;

    state.streamAborter.abort();
    state.streamAborter = new AbortController();

    state.isStreaming = false;
    state.symbols = {};

    state.inlineErrorMessage = undefined;
    state.isPruned = false;
    state.contextPercentage = undefined;

    if (payload) {
      state.history = payload.history as ChatHistoryItemWithMessageId[];
      state.title = payload.title;
      state.id = payload.sessionId;
      if (payload.mode) {
        state.mode = payload.mode;
      }
    } else {
      state.history = [];
      state.title = NEW_SESSION_TITLE;
      state.id = uuidv4();
    }
  },

  updateSessionTitle: (
    state: SessionState,
    { payload }: PayloadAction<string>,
  ) => {
    state.title = payload;
  },

  setIsSessionMetadataLoading: (
    state: SessionState,
    { payload }: PayloadAction<boolean>,
  ) => {
    state.isSessionMetadataLoading = payload;
  },

  setAllSessionMetadata: (
    state: SessionState,
    { payload }: PayloadAction<(BaseSessionMetadata | RemoteSessionMetadata)[]>,
  ) => {
    state.allSessionMetadata = payload;
  },

  //////////////////////////////////////////////////////////////////////////////////
  // These are for optimistic session metadata updates, especially for History page
  addSessionMetadata: (
    state: SessionState,
    { payload }: PayloadAction<BaseSessionMetadata>,
  ) => {
    state.allSessionMetadata = [...state.allSessionMetadata, payload];
  },

  updateSessionMetadata: (
    state: SessionState,
    {
      payload,
    }: PayloadAction<
      {
        sessionId: string;
      } & Partial<BaseSessionMetadata>
    >,
  ) => {
    state.allSessionMetadata = state.allSessionMetadata.map((session) =>
      session.sessionId === payload.sessionId
        ? {
            ...session,
            ...payload,
          }
        : session,
    );
    if (payload.title && payload.sessionId === state.id) {
      state.title = payload.title;
    }
  },

  deleteSessionMetadata: (
    state: SessionState,
    { payload }: PayloadAction<string>,
  ) => {
    // Note, should not be allowed to delete current session from chat session
    state.allSessionMetadata = state.allSessionMetadata.filter(
      (session) => session.sessionId !== payload,
    );
  },
  //////////////////////////////////////////////////////////////////////////////////
};

export default sessionMetadataReducers;
