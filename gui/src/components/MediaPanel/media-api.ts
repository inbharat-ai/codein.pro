/** IPC / HTTP bridge for the media service. */

const ipc = (window as any).electron?.ipcRenderer;

export async function mediaInvoke(
  channel: string,
  ...args: any[]
): Promise<any> {
  if (ipc) {
    return ipc.invoke(channel, ...args);
  }
  // Fallback for web dev mode: direct HTTP to media service
  const MEDIA_BASE = "http://127.0.0.1:43130";
  const endpointMap: Record<string, string> = {
    "media:health": "/health",
    "media:modelsStatus": "/models/status",
    "media:generateImage": "/generate/image",
    "media:generateVideo": "/generate/video",
    "media:renderDiagram": "/generate/diagram",
  };
  const endpoint = endpointMap[channel];
  if (!endpoint) throw new Error(`Unknown channel: ${channel}`);
  const method = args.length > 0 ? "POST" : "GET";
  const res = await fetch(`${MEDIA_BASE}${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: args.length > 0 ? JSON.stringify(args[0]) : undefined,
  });
  return res.json();
}
