/**
 * AnalyzingIndicator — Shows real-time analysis progress
 * Uses CSS classes from codin-theme.css:
 *   .codin-analyzing, .codin-step-chip--done/--pending
 */
import { useEffect, useState } from "react";

interface AnalysisStep {
  label: string;
  count?: number;
  unit?: string;
  done: boolean;
}

interface AnalyzingIndicatorProps {
  steps: AnalysisStep[];
  active: boolean;
  phase?: string; // e.g. "Classifying", "Verifying", "Scoring"
}

export function AnalyzingIndicator({
  steps,
  active,
  phase,
}: AnalyzingIndicatorProps) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setDotCount((d) => (d % 3) + 1);
    }, 400);
    return () => clearInterval(timer);
  }, [active]);

  if (!active && steps.every((s) => s.done)) return null;

  const dots = ".".repeat(dotCount);

  return (
    <div
      className={`codin-analyzing codin-animate-slide-up`}
      style={{ opacity: active ? 1 : 0.5 }}
    >
      {/* Phase header */}
      <div className="codin-analyzing__header">
        {active ? `${phase || "Analyzing"}${dots}` : "Analysis Complete ✓"}
      </div>

      {/* Steps row */}
      <div className="codin-analyzing__steps">
        {steps.map((step, i) => (
          <StepChip key={i} step={step} />
        ))}
      </div>
    </div>
  );
}

function StepChip({ step }: { step: AnalysisStep }) {
  const value =
    step.count != null ? `${step.count} ${step.unit || ""}`.trim() : "";
  return (
    <span
      className={`codin-step-chip ${step.done ? "codin-step-chip--done" : "codin-step-chip--pending"}`}
    >
      <span>{step.done ? "✓" : "●"}</span>
      {value && <span style={{ fontWeight: 500 }}>{value}</span>}
      <span style={{ opacity: 0.8 }}>{step.label}</span>
    </span>
  );
}

export default AnalyzingIndicator;
