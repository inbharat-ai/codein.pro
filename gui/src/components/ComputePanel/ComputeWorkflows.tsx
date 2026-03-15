/** Quick workflow cards for demo workflows. */
import React from "react";

import { DEMO_WORKFLOWS } from "./compute-types";

interface ComputeWorkflowsProps {
  useIpcCompute: boolean;
  onRunWorkflow: (name: string) => void;
}

export const ComputeWorkflows: React.FC<ComputeWorkflowsProps> = ({
  useIpcCompute,
  onRunWorkflow,
}) => {
  return (
    <div className="compute-workflows">
      <span className="compute-workflows__title">Quick Workflows</span>
      {DEMO_WORKFLOWS.map((wf) => {
        const isDisabled = useIpcCompute && wf.name === "research-code";
        return (
          <div
            key={wf.name}
            className="compute-workflow-card codin-animate-in"
            onClick={() => {
              if (!isDisabled) onRunWorkflow(wf.name);
            }}
            style={
              isDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined
            }
          >
            <span className="compute-workflow-card__icon">{wf.icon}</span>
            <div className="compute-workflow-card__info">
              <div className="compute-workflow-card__name">{wf.title}</div>
              <div className="compute-workflow-card__desc">
                {wf.description}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
