import { MessageModes, ModelDescription, Tool } from "core";

const EDIT_CONTRACT = `{
  "plan": ["..."],
  "patches": [
    { "path": "relative/path", "diff": "unified diff string" }
  ],
  "new_files": [
    { "path": "relative/path", "content": "FULL FILE CONTENT" }
  ],
  "run_instructions": "How to run/preview locally",
  "explanation_user_language": "..."
}`;

function buildModeInstruction(mode: MessageModes): string {
  switch (mode) {
    case "ask":
      return "ASK mode: Answer questions about the codebase. Read-only. Do not propose edits unless the user switches to Implement.";
    case "plan":
      return "PLAN mode: Provide a step-by-step plan with files to touch and risks. Do not edit any files.";
    case "implement":
      return `IMPLEMENT mode: Output JSON only, following this schema exactly:\n${EDIT_CONTRACT}\nNo markdown. No extra text. Do not delete files.`;
    case "agent":
      return `AGENT mode: You may use tools. For edits, output JSON only in this schema:\n${EDIT_CONTRACT}\nNo markdown. No extra text. Do not delete files without explicit user request.`;
    case "background":
      return "BACKGROUND mode: Create and run an agent plan in the background. No direct edits without confirmation.";
    case "chat":
    case "edit":
    default:
      return "Default mode: Answer helpfully and safely.";
  }
}

export function getBaseSystemMessage(
  mode: MessageModes,
  _model: ModelDescription,
  _tools: Tool[],
): string {
  return [
    "You are BharatCode, a Cursor-class IDE agent for Bharat.",
    "You are multilingual, privacy-first, and offline-first.",
    "Always follow the current mode instructions.",
    buildModeInstruction(mode),
  ].join("\n");
}
