/**
 * Copilot Slice - Chat messages, AI state
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  code?: string;
}

interface CopilotState {
  messages: ChatMessage[];
  isGenerating: boolean;
  selectedModel: string;
  modelSettings: {
    temperature: number;
    topP: number;
    maxTokens: number;
  };
}

const initialState: CopilotState = {
  messages: [],
  isGenerating: false,
  selectedModel: "qwen2.5-coder-1.5b",
  modelSettings: {
    temperature: 0.7,
    topP: 0.95,
    maxTokens: 2000,
  },
};

const copilotSlice = createSlice({
  name: "copilot",
  initialState,
  reducers: {
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
    },
    clearMessages: (state) => {
      state.messages = [];
    },
    setIsGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
    },
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModel = action.payload;
    },
    setModelSettings: (state, action) => {
      state.modelSettings = action.payload;
    },
  },
});

export const {
  addMessage,
  clearMessages,
  setIsGenerating,
  setSelectedModel,
  setModelSettings,
} = copilotSlice.actions;

export default copilotSlice.reducer;
