import { getContinueRcPath, getTsConfigPath } from "core/util/paths";
import { Telemetry } from "core/util/posthog";
import * as vscode from "vscode";

import { VsCodeExtension } from "../extension/VsCodeExtension";
import { getExtensionVersion, isUnsupportedPlatform } from "../util/util";

import { GlobalContext } from "core/util/GlobalContext";
import { getAgentServerClient } from "../agent/AgentServerClient";
import { startCodInAgent } from "../agent/BharatAgentManager";
import { initializeLogger, logger } from "../agent/logger";
import { VsCodeContinueApi } from "./api";
import setupInlineTips from "./InlineTipManager";

export async function activateExtension(context: vscode.ExtensionContext) {
  const platformCheck = isUnsupportedPlatform();
  const globalContext = new GlobalContext();
  const hasShownUnsupportedPlatformWarning = globalContext.get(
    "hasShownUnsupportedPlatformWarning",
  );

  // Initialize logger
  initializeLogger();
  logger.info("Activating CodIn extension");

  if (platformCheck.isUnsupported && !hasShownUnsupportedPlatformWarning) {
    const platformTarget = "windows-arm64";

    globalContext.update("hasShownUnsupportedPlatformWarning", true);
    void vscode.window.showInformationMessage(
      `CodIn detected that you are using ${platformTarget}. Due to native dependencies, CodIn may not be able to start`,
    );

    void Telemetry.capture(
      "unsupported_platform_activation_attempt",
      {
        platform: platformTarget,
        extensionVersion: getExtensionVersion(),
        reason: platformCheck.reason,
      },
      true,
    );
  }

  // Add necessary files
  getTsConfigPath();
  getContinueRcPath();

  // Register commands and providers
  setupInlineTips(context);
  startCodInAgent(context);

  // Initialize Agent Server Client
  const agentClient = getAgentServerClient(
    parseInt(process.env.CODIN_AGENT_PORT || "43120", 10),
  );

  // Monitor connection status
  agentClient.onConnectionStatusChange((status) => {
    logger.info(`Agent server connection: ${status}`);
    if (status === "connected") {
      vscode.window.showInformationMessage("CodIn Agent Server connected", {
        modal: false,
      });
    }
  });

  // Listen for permission requests
  agentClient.onPermission(async (request) => {
    const result = await vscode.window.showInformationMessage(
      `Permission required: ${request.description}`,
      { modal: true },
      "Allow",
      "Deny",
    );

    const approved = result === "Allow";
    await agentClient.respondToPermission(request.requestId, approved);

    if (approved) {
      logger.info(`Permission approved: ${request.requestId}`);
    } else {
      logger.info(`Permission denied: ${request.requestId}`);
    }
  });

  context.subscriptions.push({
    dispose: () => {
      agentClient.dispose();
    },
  });

  const vscodeExtension = new VsCodeExtension(context);

  // Load CodIn configuration
  if (!context.globalState.get("hasBeenInstalled")) {
    void context.globalState.update("hasBeenInstalled", true);
    void Telemetry.capture(
      "install",
      {
        extensionVersion: getExtensionVersion(),
      },
      true,
    );
  }

  // Register config.yaml schema by removing old entries and adding new one (uri.fsPath changes with each version)
  const yamlMatcher = ".continue/**/*.yaml";
  const yamlConfig = vscode.workspace.getConfiguration("yaml");
  const yamlSchemas = yamlConfig.get<object>("schemas", {});

  const newPath = vscode.Uri.joinPath(
    context.extension.extensionUri,
    "config-yaml-schema.json",
  ).toString();

  try {
    await yamlConfig.update(
      "schemas",
      {
        ...yamlSchemas,
        [newPath]: [yamlMatcher],
      },
      vscode.ConfigurationTarget.Global,
    );
  } catch (error) {
    console.error(
      "Failed to register Continue config.yaml schema, most likely, YAML extension is not installed",
      error,
    );
  }

  const api = new VsCodeContinueApi(vscodeExtension);
  const continuePublicApi = {
    registerCustomContextProvider: api.registerCustomContextProvider.bind(api),
  };

  // 'export' public api-surface
  // or entire extension for testing
  return process.env.NODE_ENV === "test"
    ? {
        ...continuePublicApi,
        extension: vscodeExtension,
      }
    : continuePublicApi;
}
