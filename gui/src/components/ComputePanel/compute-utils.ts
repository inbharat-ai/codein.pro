/** Display helpers for the Compute panel. */

export function getStepIcon(status: string): string {
  switch (status) {
    case "completed":
      return "checkmark";
    case "running":
      return "play";
    case "failed":
      return "x";
    case "skipped":
      return "skip";
    case "escalated":
      return "up";
    default:
      return "circle";
  }
}

export function getArtifactIcon(type: string): string {
  switch (type) {
    case "diff":
      return "Diff";
    case "report":
      return "Report";
    case "code":
      return "Code";
    case "log":
      return "Log";
    case "doc":
      return "Doc";
    default:
      return "File";
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
