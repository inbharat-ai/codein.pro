/**
 * Git Slice - Git status, changes, history
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface GitFile {
  path: string;
  status: "M" | "A" | "D" | "U" | "?"; // Modified, Added, Deleted, Updated, Untracked
  staged: boolean;
}

interface GitCommit {
  hash: string;
  author: string;
  message: string;
  date: number;
}

interface GitState {
  changes: GitFile[];
  currentBranch: string;
  branches: string[];
  commits: GitCommit[];
  remotes: string[];
  stagedFiles: Set<string>;
}

const initialState: GitState = {
  changes: [],
  currentBranch: "main",
  branches: ["main"],
  commits: [],
  remotes: [],
  stagedFiles: new Set(),
};

const gitSlice = createSlice({
  name: "git",
  initialState,
  reducers: {
    setChanges: (state, action: PayloadAction<GitFile[]>) => {
      state.changes = action.payload;
    },
    setCurrentBranch: (state, action: PayloadAction<string>) => {
      state.currentBranch = action.payload;
    },
    setBranches: (state, action: PayloadAction<string[]>) => {
      state.branches = action.payload;
    },
    setCommits: (state, action: PayloadAction<GitCommit[]>) => {
      state.commits = action.payload;
    },
    setRemotes: (state, action: PayloadAction<string[]>) => {
      state.remotes = action.payload;
    },
    stageFile: (state, action: PayloadAction<string>) => {
      state.stagedFiles.add(action.payload);
    },
    unstageFile: (state, action: PayloadAction<string>) => {
      state.stagedFiles.delete(action.payload);
    },
  },
});

export const {
  setChanges,
  setCurrentBranch,
  setBranches,
  setCommits,
  setRemotes,
  stageFile,
  unstageFile,
} = gitSlice.actions;

export default gitSlice.reducer;
