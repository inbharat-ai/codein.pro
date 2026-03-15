/** Artifacts list for a compute job. */
import React from "react";

import type { Artifact } from "./compute-types";
import { formatSize, getArtifactIcon } from "./compute-utils";

interface ComputeArtifactsProps {
  artifacts: Artifact[];
}

export const ComputeArtifacts: React.FC<ComputeArtifactsProps> = ({
  artifacts,
}) => {
  if (artifacts.length === 0) return null;

  return (
    <div className="compute-artifacts">
      <span className="compute-artifacts__title">Artifacts</span>
      {artifacts.map((art) => (
        <div key={art.id} className="compute-artifact">
          <span className="compute-artifact__icon">
            {getArtifactIcon(art.type)}
          </span>
          <span className="compute-artifact__name">
            {art.name || art.fileName}
          </span>
          <span className="compute-artifact__size">{formatSize(art.size)}</span>
        </div>
      ))}
    </div>
  );
};
