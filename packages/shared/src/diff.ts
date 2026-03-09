export function applyUnifiedDiff(
  originalText: string,
  diffText: string,
): string {
  const originalLines = originalText.split("\n");
  const diffLines = diffText.split("\n");

  let output: string[] = [];
  let originalIndex = 0;
  let i = 0;

  const hasTrailingNewline = originalText.endsWith("\n");

  while (i < diffLines.length) {
    const line = diffLines[i];

    if (line.startsWith("---") || line.startsWith("+++")) {
      i += 1;
      continue;
    }

    if (line.startsWith("@@")) {
      const match = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(line);
      if (!match) {
        throw new Error("Invalid unified diff hunk header");
      }

      const oldStart = Number(match[1]) - 1;

      while (originalIndex < oldStart) {
        output.push(originalLines[originalIndex]);
        originalIndex += 1;
      }

      i += 1;
      while (i < diffLines.length && !diffLines[i].startsWith("@@")) {
        const hunkLine = diffLines[i];
        if (hunkLine.startsWith(" ")) {
          output.push(hunkLine.slice(1));
          originalIndex += 1;
        } else if (hunkLine.startsWith("-")) {
          originalIndex += 1;
        } else if (hunkLine.startsWith("+")) {
          output.push(hunkLine.slice(1));
        } else if (hunkLine.startsWith("\\")) {
          // No newline at end of file marker; ignore
        } else {
          throw new Error(`Unexpected diff line: ${hunkLine}`);
        }
        i += 1;
      }
      continue;
    }

    i += 1;
  }

  while (originalIndex < originalLines.length) {
    output.push(originalLines[originalIndex]);
    originalIndex += 1;
  }

  const result = output.join("\n");
  return hasTrailingNewline ? `${result}\n` : result;
}
