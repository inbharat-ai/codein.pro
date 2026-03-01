import { ToIdeFromWebviewOrCoreProtocol } from "./ide";
import { ToWebviewFromIdeOrCoreProtocol } from "./webview";

import {
  AcceptOrRejectDiffPayload,
  AddToChatPayload,
  ApplyState,
  ApplyToFilePayload,
  ContextItemWithId,
  HighlightedCodePayload,
  MessageContent,
  RangeInFile,
  RangeInFileWithContents,
  SetCodeToEditPayload,
  ShowFilePayload,
} from "../";

export type ToIdeFromWebviewProtocol = ToIdeFromWebviewOrCoreProtocol & {
  openUrl: [string, void];
  applyToFile: [ApplyToFilePayload, void];
  overwriteFile: [{ filepath: string; prevFileContent: string | null }, void];
  showTutorial: [undefined, void];
  showFile: [ShowFilePayload, void];
  toggleDevTools: [undefined, void];
  reloadWindow: [undefined, void];
  focusEditor: [undefined, void];
  toggleFullScreen: [{ newWindow?: boolean } | undefined, void];
  insertAtCursor: [{ text: string }, void];
  copyText: [{ text: string }, void];
  "jetbrains/isOSREnabled": [undefined, boolean];
  "jetbrains/onLoad": [
    undefined,
    {
      windowId: string;
      serverUrl: string;
      workspacePaths: string[];
      vscMachineId: string;
      vscMediaUrl: string;
    },
  ];
  "jetbrains/getColors": [undefined, Record<string, string | null | undefined>];
  "vscode/openMoveRightMarkdown": [undefined, void];
  acceptDiff: [AcceptOrRejectDiffPayload, void];
  rejectDiff: [AcceptOrRejectDiffPayload, void];
  "edit/sendPrompt": [
    {
      prompt: MessageContent;
      range: RangeInFileWithContents;
    },
    string | undefined,
  ];
  "edit/addCurrentSelection": [undefined, void];
  "edit/clearDecorations": [undefined, void];
  "contract/apply": [
    {
      contract: {
        plan: string[];
        patches: Array<{ path: string; diff: string }>;
        new_files: Array<{ path: string; content: string }>;
        run_instructions: string;
        explanation_user_language: string;
      };
    },
    { backupId: string },
  ];
  "contract/rollback": [{ backupId: string }, void];
  "run/detect": [
    undefined,
    {
      projectType: string;
      command: string;
      args: string[];
      cwd: string;
      packageManager: string;
      port?: number;
      previewUrl?: string;
    },
  ];
  "run/execute": [
    {
      command: string;
      args?: string[];
      cwd?: string;
      name?: string;
      port?: number;
    },
    { runId: string; previewUrl?: string },
  ];
  "run/stop": [{ runId: string }, void];
  "run/openPreview": [{ url: string }, void];
  "git/status": [
    undefined,
    { branch: string | null; changes: Array<{ path: string; status: string }> },
  ];
  "git/commit": [
    { message: string; addAll?: boolean },
    { commitHash?: string },
  ];
  "git/push": [
    { remote?: string; branch?: string },
    { ok: boolean; output?: string },
  ];
  "git/checkout": [{ branch: string; create?: boolean }, { branch: string }];
  "deploy/generate": [
    { target: "vercel" | "netlify" | "firebase" },
    { files: Array<{ path: string; created: boolean }>; instructions: string },
  ];
  "mcp/list": [
    undefined,
    {
      servers: Array<{ name: string; status: string; tools: number }>;
      tools: Array<{ name: string; description?: string; server?: string }>;
    },
  ];
  "session/share": [{ sessionId: string }, void];
  createBackgroundAgent: [
    {
      content: MessageContent;
      contextItems: ContextItemWithId[];
      selectedCode: RangeInFile[];
      organizationId?: string;
      agent?: string;
    },
    void,
  ];
  listBackgroundAgents: [
    { organizationId?: string; limit?: number },
    {
      agents: Array<{
        id: string;
        name: string | null;
        status: string;
        repoUrl: string;
        createdAt: string;
        metadata?: {
          github_repo?: string;
        };
      }>;
      totalCount: number;
    },
  ];
  openAgentLocally: [
    {
      agentSessionId: string;
    },
    void,
  ];
};

export type ToWebviewFromIdeProtocol = ToWebviewFromIdeOrCoreProtocol & {
  setInactive: [undefined, void];
  newSessionWithPrompt: [{ prompt: string }, void];
  userInput: [{ input: string }, void];
  focusContinueInput: [undefined, void];
  focusContinueInputWithoutClear: [undefined, void];
  focusContinueInputWithNewSession: [undefined, void];
  highlightedCode: [HighlightedCodePayload, void];
  setCodeToEdit: [SetCodeToEditPayload, void];
  navigateTo: [{ path: string; toggle?: boolean }, void];
  addModel: [undefined, void];

  focusContinueSessionId: [{ sessionId: string | undefined }, void];
  newSession: [undefined, void];
  loadAgentSession: [{ session: any }, void];
  setTheme: [{ theme: any }, void];
  setColors: [{ [key: string]: string }, void];
  "jetbrains/editorInsetRefresh": [undefined, void];
  "jetbrains/isOSREnabled": [boolean, void];
  setupApiKey: [undefined, void];
  setupLocalConfig: [undefined, void];
  incrementFtc: [undefined, void];
  openOnboardingCard: [undefined, void];
  applyCodeFromChat: [undefined, void];
  updateApplyState: [ApplyState, void];
  exitEditMode: [undefined, void];
  focusEdit: [undefined, void];
  generateRule: [undefined, void];
  addToChat: [AddToChatPayload, void];
  "contract/applied": [{ backupId: string }, void];
  "contract/rolledBack": [{ backupId: string }, void];
};
