/**
 * CodeIn Media Toolkit — Permission & Audit Layer
 *
 * Fail-closed permission checks for all media.* tools.
 * Logs prompt hashes (never raw prompts), seeds, model IDs, timestamps.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/** @enum {string} */
const MediaPermission = {
  RENDER_DIAGRAM: "media.render_diagram",
  GENERATE_IMAGE: "media.generate_image",
  GENERATE_VIDEO: "media.generate_video",
  IMAGE_TO_VIDEO: "media.image_to_video",
};

const ALL_MEDIA_PERMISSIONS = Object.values(MediaPermission);

/**
 * @typedef {Object} AuditEntry
 * @property {string} timestamp
 * @property {string} permission
 * @property {string} promptHash    - SHA-256 of prompt text
 * @property {number} seed
 * @property {string} modelId
 * @property {string} presetId
 * @property {string} outputPath
 * @property {boolean} approved
 */

/**
 * @typedef {Object} PermissionGate
 * @property {function(string): Promise<boolean>} checkPermission - returns true if granted
 * @property {function(string, Object): Promise<boolean>} requestApproval - ask user for first-use approval
 */

/**
 * Create a media permission checker that integrates with
 * the existing PermissionManager or agent PolicyEnforcer.
 *
 * @param {Object} opts
 * @param {PermissionGate|null} opts.permissionGate - external permission system
 * @param {string} opts.auditLogDir - directory for audit logs
 * @param {boolean} opts.saveRawPrompts - if true, also stores raw prompt (default false)
 * @returns {Object}
 */
function createMediaPermissions({
  permissionGate = null,
  auditLogDir,
  saveRawPrompts = false,
}) {
  // Ensure audit dir
  if (auditLogDir) {
    try {
      fs.mkdirSync(auditLogDir, { recursive: true });
    } catch {
      /* best-effort */
    }
  }

  const auditLogPath = auditLogDir
    ? path.join(auditLogDir, "media-audit.jsonl")
    : null;

  /**
   * Hash a prompt string (SHA-256)
   * @param {string} prompt
   * @returns {string}
   */
  function hashPrompt(prompt) {
    return crypto
      .createHash("sha256")
      .update(prompt || "")
      .digest("hex");
  }

  /**
   * Write an audit entry (append JSONL)
   * @param {AuditEntry} entry
   */
  function writeAudit(entry) {
    if (!auditLogPath) return;
    try {
      const line = JSON.stringify(entry) + "\n";
      fs.appendFileSync(auditLogPath, line, "utf-8");
    } catch {
      /* best-effort logging */
    }
  }

  /**
   * Check if a media permission is granted. FAIL-CLOSED.
   * @param {string} permission - one of MediaPermission
   * @returns {Promise<boolean>}
   */
  async function isPermitted(permission) {
    if (!ALL_MEDIA_PERMISSIONS.includes(permission)) {
      return false; // unknown permission → deny
    }
    if (!permissionGate) {
      return false; // no permission system → deny (fail-closed)
    }
    try {
      return await permissionGate.checkPermission(permission);
    } catch {
      return false; // error → deny
    }
  }

  /**
   * Request user approval for a media tool. Returns approval info object.
   *
   * @param {string} permission
   * @param {Object} context
   * @param {string} context.modelId
   * @param {number} context.modelSizeMB
   * @param {boolean} context.requiresDownload
   * @param {string} context.outputDir
   * @returns {Promise<{approved: boolean, message: string}>}
   */
  async function requestApproval(permission, context) {
    if (!permissionGate) {
      return {
        approved: false,
        message: "Permission system not available. Media tools are disabled.",
      };
    }

    const approvalInfo = {
      action: describePermission(permission),
      details: [],
    };

    if (context.requiresDownload) {
      approvalInfo.details.push(
        `This will download an AI model (~${context.modelSizeMB} MB) from Hugging Face.`,
      );
    }
    approvalInfo.details.push(`Outputs will be saved to: ${context.outputDir}`);
    approvalInfo.details.push(
      "Generation runs entirely on your local machine.",
    );

    try {
      const approved = await permissionGate.requestApproval(
        permission,
        approvalInfo,
      );
      return {
        approved,
        message: approved ? "Approved" : "User denied permission.",
      };
    } catch {
      return { approved: false, message: "Permission request failed." };
    }
  }

  /**
   * Full permission gate: check → request if needed → audit.
   * Returns { allowed, reason }.
   */
  async function gate(
    permission,
    {
      prompt = "",
      seed = 0,
      modelId = "",
      presetId = "",
      outputPath = "",
      modelSizeMB = 0,
      requiresDownload = false,
      outputDir = "",
    },
  ) {
    // 1. Check existing permission
    let allowed = await isPermitted(permission);

    // 2. If not yet permitted, request approval
    if (!allowed) {
      const result = await requestApproval(permission, {
        modelId,
        modelSizeMB,
        requiresDownload,
        outputDir,
      });
      allowed = result.approved;
      if (!allowed) {
        writeAudit({
          timestamp: new Date().toISOString(),
          permission,
          promptHash: hashPrompt(prompt),
          seed,
          modelId,
          presetId,
          outputPath: "",
          approved: false,
        });
        return { allowed: false, reason: result.message };
      }
    }

    // 3. Audit the allowed action
    const entry = {
      timestamp: new Date().toISOString(),
      permission,
      promptHash: hashPrompt(prompt),
      seed,
      modelId,
      presetId,
      outputPath,
      approved: true,
    };
    if (saveRawPrompts) entry.rawPrompt = prompt;
    writeAudit(entry);

    return { allowed: true, reason: "Permitted" };
  }

  return {
    isPermitted,
    requestApproval,
    gate,
    hashPrompt,
    writeAudit,
    MediaPermission,
  };
}

function describePermission(perm) {
  switch (perm) {
    case MediaPermission.RENDER_DIAGRAM:
      return "Render a diagram (Mermaid/PlantUML/D2)";
    case MediaPermission.GENERATE_IMAGE:
      return "Generate an AI image locally";
    case MediaPermission.GENERATE_VIDEO:
      return "Generate an AI video locally";
    case MediaPermission.IMAGE_TO_VIDEO:
      return "Convert an image to a short video clip";
    default:
      return "Unknown media operation";
  }
}

module.exports = {
  MediaPermission,
  ALL_MEDIA_PERMISSIONS,
  createMediaPermissions,
};
