import { ConfigValidationError } from "@codein/config-yaml";
import { IDE, RuleWithSource } from "..";
import { joinPathsToUri } from "../util/uri";
export const SYSTEM_PROMPT_DOT_FILE = ".continuerules";
export const SYSTEM_PROMPT_DOT_FILE_NEW = ".codeinrules";

export async function getWorkspaceContinueRuleDotFiles(ide: IDE) {
  const dirs = await ide.getWorkspaceDirs();

  const errors: ConfigValidationError[] = [];
  const rules: RuleWithSource[] = [];
  for (const dir of dirs) {
    try {
      // Check .codeinrules first, then .continuerules for backward compat
      let found = false;
      for (const dotFileName of [SYSTEM_PROMPT_DOT_FILE_NEW, SYSTEM_PROMPT_DOT_FILE]) {
        const dotFile = joinPathsToUri(dir, dotFileName);
        const exists = await ide.fileExists(dotFile);
        if (exists) {
          const content = await ide.readFile(dotFile);
          rules.push({
            rule: content,
            sourceFile: dotFile,
            source: ".continuerules",
          });
          found = true;
          break;
        }
      }
    } catch (e) {
      errors.push({
        fatal: false,
        message: `Failed to load system prompt dot file from workspace ${dir}: ${e instanceof Error ? e.message : e}`,
      });
    }
  }

  return { rules, errors };
}
