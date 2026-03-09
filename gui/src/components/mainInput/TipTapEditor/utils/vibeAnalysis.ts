import { agentFetch } from "../../../../util/agentConfig";

export interface VibeAnalyzeResult {
  spec: Record<string, any>;
  analysisTimestamp: string;
}

function parseDataUrl(dataUrl: string): {
  mimeType: string;
  imageBase64: string;
} {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return {
    mimeType: match[1],
    imageBase64: match[2],
  };
}

export async function analyzeVibeImage(
  dataUrl: string,
): Promise<VibeAnalyzeResult> {
  const { mimeType, imageBase64 } = parseDataUrl(dataUrl);

  const response = await agentFetch("/vibe/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.error || `Vibe analyze failed (${response.status})`,
    );
  }

  const payload = await response.json();
  return {
    spec: payload.spec || {},
    analysisTimestamp: payload.analysisTimestamp || new Date().toISOString(),
  };
}
