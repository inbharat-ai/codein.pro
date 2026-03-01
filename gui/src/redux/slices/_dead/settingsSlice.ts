/**
 * Settings Slice - User preferences, configuration
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface SettingsState {
  theme: "light" | "dark" | "auto";
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: "on" | "off" | "wordWrapColumn";
  minimap: boolean;
  formatOnSave: boolean;
  autoSave: "off" | "afterDelay" | "onFocusChange" | "onWindowChange";
  autoSaveDelay: number;
  language: string;
  voiceLanguage: string;
  keybindings: "default" | "vim" | "emacs" | "sublime";
  gitAuthor: string;
  gitEmail: string;
}

const initialState: SettingsState = {
  theme: "dark",
  fontSize: 13,
  fontFamily: "Fira Code, monospace",
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "on",
  minimap: true,
  formatOnSave: true,
  autoSave: "afterDelay",
  autoSaveDelay: 1000,
  language: "en",
  voiceLanguage: "en",
  keybindings: "default",
  gitAuthor: "User",
  gitEmail: "user@example.com",
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateSetting: (
      state,
      action: PayloadAction<{ key: keyof SettingsState; value: any }>,
    ) => {
      (state as any)[action.payload.key] = action.payload.value;
    },
    loadSettings: (state, action: PayloadAction<Partial<SettingsState>>) => {
      return { ...state, ...action.payload };
    },
  },
});

export const { updateSetting, loadSettings } = settingsSlice.actions;

export default settingsSlice.reducer;
