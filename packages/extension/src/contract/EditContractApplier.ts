import * as path from "node:path";
import * as fs from "node:fs";
import * as vscode from "vscode";
import { applyUnifiedDiff } from "codin-shared";
import { VsCodeIde } from "../VsCodeIde";

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

export type ContractBackup = {
  id: string;
  files: Array<{ uri: string; backupPath: string }>;
  createdAt: number;
};

async function ensureDir(dirPath: string) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

function resolveWorkspacePath(relativePath: string): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return path.resolve(relativePath);
  }
  return path.join(workspaceRoot, relativePath);
}

export async function applyEditContract(
  contract: EditContractPayload,
  ide: VsCodeIde,
  context: vscode.ExtensionContext,
): Promise<ContractBackup> {
  const backupRoot = path.join(
    context.globalStorageUri.fsPath,
    "contract-backups",
  );
  await ensureDir(backupRoot);

  const backupId = Date.now().toString();
  const backupDir = path.join(backupRoot, backupId);
  await ensureDir(backupDir);

  const backup: ContractBackup = {
    id: backupId,
    files: [],
    createdAt: Date.now(),
  };

  // Apply patches
  for (const patch of contract.patches) {
    const fileUri = vscode.Uri.file(
      resolveWorkspacePath(patch.path),
    ).toString();
    const original = await ide.readFile(fileUri);
    const backupPath = path.join(backupDir, path.basename(patch.path) + ".bak");
    await fs.promises.writeFile(backupPath, original, "utf8");
    backup.files.push({ uri: fileUri, backupPath });

    const updated = applyUnifiedDiff(original, patch.diff);
    await ide.writeFile(fileUri, updated);
  }

  // Write new files
  for (const file of contract.new_files) {
    const fileUri = vscode.Uri.file(resolveWorkspacePath(file.path)).toString();
    const exists = await ide.fileExists(fileUri);
    if (exists) {
      const original = await ide.readFile(fileUri);
      const backupPath = path.join(
        backupDir,
        path.basename(file.path) + ".bak",
      );
      await fs.promises.writeFile(backupPath, original, "utf8");
      backup.files.push({ uri: fileUri, backupPath });
    }
    await ide.writeFile(fileUri, file.content);
  }

  await fs.promises.writeFile(
    path.join(backupDir, "backup.json"),
    JSON.stringify(backup, null, 2),
    "utf8",
  );

  return backup;
}

export async function rollbackEditContract(
  backupId: string,
  ide: VsCodeIde,
  context: vscode.ExtensionContext,
): Promise<void> {
  const backupRoot = path.join(
    context.globalStorageUri.fsPath,
    "contract-backups",
  );
  const backupDir = path.join(backupRoot, backupId);
  const metadataPath = path.join(backupDir, "backup.json");

  if (!fs.existsSync(metadataPath)) {
    throw new Error("Backup metadata not found");
  }

  const metadata = JSON.parse(
    await fs.promises.readFile(metadataPath, "utf8"),
  ) as ContractBackup;

  for (const file of metadata.files) {
    const contents = await fs.promises.readFile(file.backupPath, "utf8");
    await ide.writeFile(file.uri, contents);
  }
}
