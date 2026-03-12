export type EditContractPatch = {
  path: string;
  diff: string;
};

export type EditContractNewFile = {
  path: string;
  content: string;
};

export type EditContractPayload = {
  plan: string[];
  patches: EditContractPatch[];
  new_files: EditContractNewFile[];
  run_instructions: string;
  explanation_user_language: string;
};

export type EditContractValidation = {
  ok: boolean;
  error?: string;
  value?: EditContractPayload;
  repaired?: boolean;
};

export { applyUnifiedDiff } from "./diff.ts";

function parseJsonStrict(raw: string): {
  ok: boolean;
  value?: any;
  error?: string;
} {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

function tryRepairJson(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
}

function isStringArray(value: any): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isPatchArray(value: any): value is EditContractPatch[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.path === "string" &&
        typeof item.diff === "string",
    )
  );
}

function isNewFileArray(value: any): value is EditContractNewFile[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.path === "string" &&
        typeof item.content === "string",
    )
  );
}

export function validateEditContract(raw: string): EditContractValidation {
  const parsed = parseJsonStrict(raw);
  if (!parsed.ok) {
    const repaired = tryRepairJson(raw);
    if (repaired) {
      const repairedParsed = parseJsonStrict(repaired);
      if (repairedParsed.ok) {
        const validation = validateEditContractPayload(repairedParsed.value);
        if (validation.ok) {
          return { ...validation, repaired: true };
        }
        return validation;
      }
    }
    return { ok: false, error: parsed.error || "Invalid JSON" };
  }

  return validateEditContractPayload(parsed.value);
}

export function validateEditContractPayload(
  payload: any,
): EditContractValidation {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Payload must be an object" };
  }

  const {
    plan,
    patches,
    new_files,
    run_instructions,
    explanation_user_language,
  } = payload;

  if (!isStringArray(plan)) {
    return { ok: false, error: "plan must be an array of strings" };
  }
  if (!isPatchArray(patches)) {
    return { ok: false, error: "patches must be an array of {path, diff}" };
  }
  if (!isNewFileArray(new_files)) {
    return {
      ok: false,
      error: "new_files must be an array of {path, content}",
    };
  }
  if (typeof run_instructions !== "string") {
    return { ok: false, error: "run_instructions must be a string" };
  }
  if (typeof explanation_user_language !== "string") {
    return { ok: false, error: "explanation_user_language must be a string" };
  }

  return { ok: true, value: payload };
}
