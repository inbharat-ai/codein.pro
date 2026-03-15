/** Hardware info bar with GPU/CPU display and mode toggle. */
import type { HardwareInfo, MediaMode } from "./media-types";

interface MediaHardwareBarProps {
  hardware: HardwareInfo;
  mode: MediaMode;
  onModeChange: (mode: MediaMode) => void;
}

export function MediaHardwareBar({
  hardware,
  mode,
  onModeChange,
}: MediaHardwareBarProps) {
  return (
    <div className="media-panel__hw-bar">
      <span>
        {hardware.gpuAvailable
          ? `GPU: ${hardware.gpuName} (${hardware.vramGB}GB VRAM)`
          : "CPU Only"}
      </span>
      <span>RAM: {hardware.ramGB}GB</span>
      <div className="media-panel__mode-toggle">
        <label>Mode:</label>
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as MediaMode)}
        >
          <option value="auto">Auto</option>
          <option value="cpu_only">CPU Only</option>
          <option value="gpu_only" disabled={!hardware.gpuAvailable}>
            GPU Only
          </option>
        </select>
      </div>
    </div>
  );
}
