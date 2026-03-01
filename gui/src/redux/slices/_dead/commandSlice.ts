/**
 * Complete Command Palette - Command Registry and Execution
 */

import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface Command {
  id: string;
  title: string;
  description: string;
  category: string;
  keybinding: string;
  handler: () => void | Promise<void>;
  when?: string;
}

const commands: Command[] = [
  {
    id: "editor.action.formatDocument",
    title: "Format Document",
    description: "Format the entire document",
    category: "Editor",
    keybinding: "Shift+Alt+F",
    handler: async () => {
      // TODO: Implement format
    },
  },
  {
    id: "editor.action.organizeImports",
    title: "Organize Imports",
    description: "Sort and organize imports",
    category: "Editor",
    keybinding: "Shift+Alt+O",
    handler: async () => {
      // TODO: Implement organize imports
    },
  },
  {
    id: "editor.action.quickFix",
    title: "Quick Fix",
    description: "Show quick fix suggestions",
    category: "Editor",
    keybinding: "Ctrl+.",
    handler: async () => {
      // TODO: Show quick fix menu
    },
  },
  {
    id: "editor.action.refactor",
    title: "Refactor",
    description: "Show refactor menu",
    category: "Refactor",
    keybinding: "Ctrl+Shift+R",
    handler: async () => {
      // TODO: Show refactor menu
    },
  },
  {
    id: "copilot.explain",
    title: "Explain Code",
    description: "Explain selected code using AI",
    category: "CodIn AI",
    keybinding: "Ctrl+Alt+E",
    handler: async () => {
      // TODO: Send to Copilot for explanation
    },
  },
  {
    id: "copilot.generateTests",
    title: "Generate Tests",
    description: "Generate unit tests for selected code",
    category: "CodIn AI",
    keybinding: "Ctrl+Alt+T",
    handler: async () => {
      // TODO: Generate tests
    },
  },
  {
    id: "copilot.debugIssue",
    title: "Debug Issue",
    description: "Ask AI to debug the issue",
    category: "CodIn AI",
    keybinding: "Ctrl+Alt+D",
    handler: async () => {
      // TODO: Debug with AI
    },
  },
  {
    id: "copilot.generateFromComment",
    title: "Generate Code",
    description: "Generate code from comment using AI",
    category: "CodIn AI",
    keybinding: "Ctrl+Alt+G",
    handler: async () => {
      // TODO: Generate from comment
    },
  },
  {
    id: "copilot.voice",
    title: "Voice Chat",
    description: "Start voice chat with AI",
    category: "CodIn AI",
    keybinding: "Ctrl+Shift+V",
    handler: async () => {
      // TODO: Start voice
    },
  },
  {
    id: "git.commit",
    title: "Commit",
    description: "Commit changes",
    category: "Git",
    keybinding: "Ctrl+K Ctrl+C",
    handler: async () => {
      // TODO: Show commit ui
    },
  },
  {
    id: "git.push",
    title: "Push",
    description: "Push commits",
    category: "Git",
    keybinding: "Ctrl+K Ctrl+P",
    handler: async () => {
      // TODO: Push
    },
  },
  {
    id: "git.pull",
    title: "Pull",
    description: "Pull commits",
    category: "Git",
    keybinding: "Ctrl+K Ctrl+L",
    handler: async () => {
      // TODO: Pull
    },
  },
  {
    id: "debug.start",
    title: "Start Debugging",
    description: "Start the debugger",
    category: "Debug",
    keybinding: "F5",
    handler: async () => {
      // TODO: Start debugger
    },
  },
  {
    id: "debug.continue",
    title: "Continue",
    description: "Continue execution",
    category: "Debug",
    keybinding: "F5",
    handler: async () => {
      // TODO: Continue
    },
  },
  {
    id: "test.runAll",
    title: "Run All Tests",
    description: "Run all tests",
    category: "Testing",
    keybinding: "Ctrl+Shift+T",
    handler: async () => {
      // TODO: Run tests
    },
  },
  {
    id: "build.run",
    title: "Build and Run",
    description: "Build and run the project",
    category: "Build",
    keybinding: "Ctrl+Shift+B",
    handler: async () => {
      // TODO: Build
    },
  },
  {
    id: "file.save",
    title: "Save",
    description: "Save current file",
    category: "File",
    keybinding: "Ctrl+S",
    handler: async () => {
      // TODO: Save
    },
  },
  {
    id: "file.saveAll",
    title: "Save All",
    description: "Save all files",
    category: "File",
    keybinding: "Ctrl+Shift+S",
    handler: async () => {
      // TODO: Save all
    },
  },
  {
    id: "file.newFile",
    title: "New File",
    description: "Create new file",
    category: "File",
    keybinding: "Ctrl+N",
    handler: async () => {
      // TODO: Create new file
    },
  },
  {
    id: "file.closeAll",
    title: "Close All",
    description: "Close all open files",
    category: "File",
    keybinding: "Ctrl+K Ctrl+W",
    handler: async () => {
      // TODO: Close all
    },
  },
];

interface CommandState {
  commands: Command[];
  recentCommands: string[];
}

const initialState: CommandState = {
  commands,
  recentCommands: [],
};

const commandSlice = createSlice({
  name: "commands",
  initialState,
  reducers: {
    executeCommand: (state, action: PayloadAction<string>) => {
      const command = state.commands.find((c) => c.id === action.payload);
      if (command) {
        command.handler();
        state.recentCommands = [
          action.payload,
          ...state.recentCommands.filter((c) => c !== action.payload),
        ].slice(0, 10);
      }
    },
    registerCommand: (state, action: PayloadAction<Command>) => {
      state.commands.push(action.payload);
    },
  },
});

export const { executeCommand, registerCommand } = commandSlice.actions;

export default commandSlice.reducer;

export const getCommandsForCategory = (category: string): Command[] => {
  return commands.filter((c) => c.category === category);
};

export const getCommandByKeyBinding = (
  keybinding: string,
): Command | undefined => {
  return commands.find((c) => c.keybinding === keybinding);
};
