/**
 * Editor Slice - Open files, active file, content
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface EditorFile {
  id: string;
  path: string;
  content: string;
  isDirty: boolean;
  language: string;
  encoding: string;
  eol: "LF" | "CRLF";
}

interface EditorState {
  openFiles: EditorFile[];
  activeFileId: string | null;
  unsavedFiles: Set<string>;
}

const initialState: EditorState = {
  openFiles: [],
  activeFileId: null,
  unsavedFiles: new Set(),
};

const editorSlice = createSlice({
  name: "editor",
  initialState,
  reducers: {
    openFile: (state, action: PayloadAction<string>) => {
      const path = action.payload;
      const existingFile = state.openFiles.find((f) => f.path === path);

      if (existingFile) {
        state.activeFileId = existingFile.id;
      } else {
        const newFile: EditorFile = {
          id: Date.now().toString(),
          path,
          content: "",
          isDirty: false,
          language: getLanguageForFile(path),
          encoding: "utf-8",
          eol: "LF",
        };
        state.openFiles.push(newFile);
        state.activeFileId = newFile.id;
      }
    },
    closeFile: (state, action: PayloadAction<string>) => {
      state.openFiles = state.openFiles.filter((f) => f.id !== action.payload);
      if (state.activeFileId === action.payload) {
        state.activeFileId = state.openFiles[0]?.id || null;
      }
    },
    setEditorValue: (
      state,
      action: PayloadAction<{ fileId: string; content: string }>,
    ) => {
      const file = state.openFiles.find((f) => f.id === action.payload.fileId);
      if (file) {
        file.content = action.payload.content;
        file.isDirty = true;
        state.unsavedFiles.add(file.id);
      }
    },
    setActiveFile: (state, action: PayloadAction<string>) => {
      state.activeFileId = action.payload;
    },
    saveFile: (state, action: PayloadAction<string>) => {
      const file = state.openFiles.find((f) => f.id === action.payload);
      if (file) {
        file.isDirty = false;
        state.unsavedFiles.delete(file.id);
      }
    },
    loadFileContent: (
      state,
      action: PayloadAction<{ fileId: string; content: string }>,
    ) => {
      const file = state.openFiles.find((f) => f.id === action.payload.fileId);
      if (file) {
        file.content = action.payload.content;
        file.isDirty = false;
      }
    },
  },
});

export const {
  openFile,
  closeFile,
  setEditorValue,
  setActiveFile,
  saveFile,
  loadFileContent,
} = editorSlice.actions;

export default editorSlice.reducer;

function getLanguageForFile(filepath: string): string {
  const ext = filepath.split(".").pop()?.toLowerCase();

  const languageMap: { [key: string]: string } = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    sql: "sql",
    json: "json",
    html: "html",
    css: "css",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    sh: "shellscript",
    ps1: "powershell",
  };

  return languageMap[ext || ""] || "plaintext";
}
