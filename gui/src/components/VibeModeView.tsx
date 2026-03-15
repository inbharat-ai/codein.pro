import { useAppDispatch } from "../redux/hooks";
import { streamSwarmTask } from "../redux/thunks/streamSwarmTask";
import { useCallback, useRef, useState } from "react";
import styled from "styled-components";

const DropZone = styled.div<{ $isDragging: boolean }>`
  border: 2px dashed
    ${(p) =>
      p.$isDragging
        ? "var(--codin-accent, #e8a849)"
        : "var(--vscode-panel-border, #333)"};
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
  margin: 1rem;

  &:hover {
    border-color: var(--codin-accent, #e8a849);
  }
`;

export function VibeModeView() {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleGenerate = useCallback(async () => {
    if (!description && !imagePreview) return;
    setIsGenerating(true);

    const goal = imagePreview
      ? `[Vibe Builder] ${description || "Recreate this UI from the screenshot"}`
      : `[Vibe Builder] ${description}`;

    try {
      await dispatch(
        streamSwarmTask({
          goal,
          context: {
            mode: "vibe",
            ...(imagePreview ? { screenshotDataUrl: imagePreview } : {}),
          },
          historyIndex: -1,
        }),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [description, imagePreview, dispatch]);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <h3
        className="text-lg font-medium"
        style={{ color: "var(--codin-accent, #e8a849)" }}
      >
        Vibe Builder
      </h3>
      <p className="text-sm opacity-70">
        Drop a screenshot or describe what you want to build
      </p>

      <DropZone
        $isDragging={isDragging}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {imagePreview ? (
          <img
            src={imagePreview}
            alt="Preview"
            style={{ maxHeight: 200, borderRadius: 8 }}
          />
        ) : (
          <div>
            <p>Drop a screenshot here</p>
            <p className="mt-2 text-xs opacity-50">or click to upload</p>
          </div>
        )}
      </DropZone>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        style={{ display: "none" }}
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe what you want to build..."
        className="w-full rounded-lg border p-3 text-sm"
        style={{
          backgroundColor: "var(--vscode-input-background)",
          borderColor: "var(--vscode-input-border)",
          color: "var(--vscode-input-foreground)",
          resize: "vertical",
          minHeight: "80px",
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={(!description && !imagePreview) || isGenerating}
        className="rounded-lg px-6 py-2 text-sm font-medium transition-colors"
        style={{
          backgroundColor: "var(--codin-accent, #e8a849)",
          color: "#000",
          opacity: (!description && !imagePreview) || isGenerating ? 0.5 : 1,
        }}
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>

      {imagePreview && (
        <button
          onClick={() => {
            setImagePreview(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          className="text-xs opacity-50 hover:opacity-80"
          style={{ color: "var(--vscode-foreground)" }}
        >
          Clear image
        </button>
      )}
    </div>
  );
}
