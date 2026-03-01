/**
 * Workspace Slice - Workspace configuration, settings
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface WorkspaceState {
  path: string | null;
  name: string;
  folders: string[];
  recentFiles: string[];
}

const initialState: WorkspaceState = {
  path: null,
  name: "Untitled Workspace",
  folders: [],
  recentFiles: [],
};

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    setWorkspacePath: (state, action: PayloadAction<string>) => {
      state.path = action.payload;
      state.name = action.payload.split("/").pop() || "Workspace";
    },
    addRecentFile: (state, action: PayloadAction<string>) => {
      state.recentFiles = [
        action.payload,
        ...state.recentFiles.filter((f) => f !== action.payload),
      ].slice(0, 10);
    },
    addFolder: (state, action: PayloadAction<string>) => {
      if (!state.folders.includes(action.payload)) {
        state.folders.push(action.payload);
      }
    },
  },
});

export const { setWorkspacePath, addRecentFile, addFolder } =
  workspaceSlice.actions;

export default workspaceSlice.reducer;
