import { useAppDispatch } from "../redux/hooks";
import { streamSwarmTask } from "../redux/thunks/streamSwarmTask";
import { useCallback, useRef, useState } from "react";

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

      <div
        className={`m-4 cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-[border-color] duration-200 hover:border-[var(--codin-accent,#e8a849)] ${isDragging ? "border-[var(--codin-accent,#e8a849)]" : "border-[var(--codin-border,#2a2845)]"}`}
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
      </div>

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
          backgroundColor: "var(--codin-bg-surface, #201e3a)",
          borderColor: "var(--codin-border, #2a2845)",
          color: "var(--codin-fg-primary, #e8e6f0)",
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
          style={{ color: "var(--codin-fg-primary, #e8e6f0)" }}
        >
          Clear image
        </button>
      )}
    </div>
  );
}
