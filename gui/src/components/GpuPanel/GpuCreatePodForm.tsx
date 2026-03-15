/** Form to create a new pod with the selected GPU type. */
import React, { useState } from "react";

import type { GpuType } from "./gpu-types";

interface GpuCreatePodFormProps {
  selectedGpu: string;
  gpuTypes: GpuType[];
  onCreatePod: (
    gpuTypeId: string,
    imageName: string,
    volume: string,
    ttl: string,
  ) => Promise<boolean>;
  onCreated: () => void;
}

export const GpuCreatePodForm: React.FC<GpuCreatePodFormProps> = ({
  selectedGpu,
  gpuTypes,
  onCreatePod,
  onCreated,
}) => {
  const [imageName, setImageName] = useState(
    "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  );
  const [volume, setVolume] = useState("20");
  const [ttl, setTtl] = useState("30");
  const [creating, setCreating] = useState(false);

  if (!selectedGpu) return null;

  const handleCreate = async () => {
    setCreating(true);
    const success = await onCreatePod(selectedGpu, imageName, volume, ttl);
    if (success) onCreated();
    setCreating(false);
  };

  return (
    <div className="gpu-create-form">
      <div className="gpu-create-form__title">
        Create Pod --{" "}
        {gpuTypes.find((g) => g.id === selectedGpu)?.displayName || selectedGpu}
      </div>
      <div className="gpu-connect__field">
        <label className="gpu-connect__label">Docker Image</label>
        <input
          className="gpu-connect__input"
          value={imageName}
          onChange={(e) => setImageName(e.target.value)}
          placeholder="runpod/pytorch:2.1.0-..."
        />
      </div>
      <div className="gpu-connect__row">
        <div className="gpu-connect__field">
          <label className="gpu-connect__label">Volume (GB)</label>
          <input
            className="gpu-connect__input"
            type="number"
            min="0"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
          />
        </div>
      </div>
      <button
        className="gpu-btn gpu-btn--primary"
        onClick={handleCreate}
        disabled={creating}
      >
        {creating && <span className="gpu-spinner" />}
        {creating ? "Creating..." : "Create Pod"}
      </button>
    </div>
  );
};
