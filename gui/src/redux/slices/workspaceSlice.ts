import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface OpenFile {
  path: string;
  filename: string;
  content: string;
  language: string;
  isDirty: boolean;
}

interface WorkspaceState {
  workspacePath: string | null;
  expandedDirs: string[];
  openFiles: OpenFile[];
  activeFilePath: string | null;
  terminalVisible: boolean;
  sidebarVisible: boolean;
  chatPanelVisible: boolean;
}

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  dockerfile: "dockerfile",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  txt: "plaintext",
};

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const basename = filePath.split(/[/\\]/).pop()?.toLowerCase() || "";
  if (basename === "dockerfile") return "dockerfile";
  if (basename === "makefile") return "makefile";
  return EXT_TO_LANG[ext] || "plaintext";
}

const initialState: WorkspaceState = {
  workspacePath: null,
  expandedDirs: [],
  openFiles: [],
  activeFilePath: null,
  terminalVisible: false,
  sidebarVisible: false,
  chatPanelVisible: false,
};

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    setWorkspacePath(state, action: PayloadAction<string | null>) {
      state.workspacePath = action.payload;
      state.expandedDirs = [];
    },
    toggleDir(state, action: PayloadAction<string>) {
      const idx = state.expandedDirs.indexOf(action.payload);
      if (idx >= 0) {
        state.expandedDirs.splice(idx, 1);
      } else {
        state.expandedDirs.push(action.payload);
      }
    },
    collapseAllDirs(state) {
      state.expandedDirs = [];
    },
    openFile(
      state,
      action: PayloadAction<{
        path: string;
        content: string;
      }>,
    ) {
      const { path, content } = action.payload;
      const existing = state.openFiles.find((f) => f.path === path);
      if (!existing) {
        const filename = path.split(/[/\\]/).pop() || path;
        state.openFiles.push({
          path,
          filename,
          content,
          language: languageFromPath(path),
          isDirty: false,
        });
      }
      state.activeFilePath = path;
    },
    closeFile(state, action: PayloadAction<string>) {
      state.openFiles = state.openFiles.filter(
        (f) => f.path !== action.payload,
      );
      if (state.activeFilePath === action.payload) {
        state.activeFilePath =
          state.openFiles.length > 0
            ? state.openFiles[state.openFiles.length - 1].path
            : null;
      }
    },
    setActiveFile(state, action: PayloadAction<string>) {
      state.activeFilePath = action.payload;
    },
    updateFileContent(
      state,
      action: PayloadAction<{ path: string; content: string }>,
    ) {
      const file = state.openFiles.find((f) => f.path === action.payload.path);
      if (file) {
        file.content = action.payload.content;
        file.isDirty = true;
      }
    },
    markFileSaved(state, action: PayloadAction<string>) {
      const file = state.openFiles.find((f) => f.path === action.payload);
      if (file) {
        file.isDirty = false;
      }
    },
    toggleTerminal(state) {
      state.terminalVisible = !state.terminalVisible;
    },
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible;
    },
    setSidebarVisible(state, action: PayloadAction<boolean>) {
      state.sidebarVisible = action.payload;
    },
    toggleChatPanel(state) {
      state.chatPanelVisible = !state.chatPanelVisible;
    },
  },
});

export const {
  setWorkspacePath,
  toggleDir,
  collapseAllDirs,
  openFile,
  closeFile,
  setActiveFile,
  updateFileContent,
  markFileSaved,
  toggleTerminal,
  toggleSidebar,
  setSidebarVisible,
  toggleChatPanel,
} = workspaceSlice.actions;

export default workspaceSlice.reducer;
