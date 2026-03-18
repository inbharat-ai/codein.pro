import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import dotenv from "dotenv";

dotenv.config();

export const env = {
  apiBase: process.env.CONTINUE_API_BASE ?? "https://api.continue.dev/",
  workOsClientId:
    process.env.WORKOS_CLIENT_ID ?? "client_01J0FW6XN8N2XJAECF7NE0Y65J",
  appUrl: process.env.HUB_URL || "https://continue.dev",
  continueHome: (() => {
    const envDir = process.env.CODEIN_GLOBAL_DIR || process.env.CONTINUE_GLOBAL_DIR;
    if (envDir) return envDir;
    const homeDir = os.homedir();
    const newPath = path.join(homeDir, ".codein");
    const legacyPath = path.join(homeDir, ".continue");
    if (fs.existsSync(newPath)) return newPath;
    if (fs.existsSync(legacyPath)) return legacyPath;
    return newPath;
  })(),
};
