import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  fetchWorkflows,
  runWorkflow,
  selectWorkflows,
  type WorkflowTemplate,
  type WorkflowVariable,
} from "../../redux/slices/computerSlice";

export function ComputerWorkflows() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { items: workflows, loading } = useAppSelector(selectWorkflows);
  const [runningWorkflow, setRunningWorkflow] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, unknown>>(
    {},
  );

  useEffect(() => {
    dispatch(fetchWorkflows());
  }, [dispatch]);

  const handleOpenRun = (workflow: WorkflowTemplate) => {
    if (runningWorkflow === workflow.name) {
      setRunningWorkflow(null);
      setVariableValues({});
      return;
    }
    // Pre-populate defaults
    const defaults: Record<string, unknown> = {};
    workflow.variables.forEach((v) => {
      if (v.defaultValue !== undefined) {
        defaults[v.name] = v.defaultValue;
      } else if (v.type === "boolean") {
        defaults[v.name] = false;
      } else if (v.type === "number") {
        defaults[v.name] = 0;
      } else {
        defaults[v.name] = "";
      }
    });
    setVariableValues(defaults);
    setRunningWorkflow(workflow.name);
  };

  const handleRun = (name: string) => {
    dispatch(runWorkflow({ name, variables: variableValues }));
    setRunningWorkflow(null);
    setVariableValues({});
  };

  const updateVariable = (varName: string, value: unknown) => {
    setVariableValues((prev) => ({ ...prev, [varName]: value }));
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-2">
      <h3 className="text-vsc-foreground/70 text-xs font-semibold">
        {t("computer.workflows.title")}
      </h3>

      {/* Loading */}
      {loading && (
        <p className="text-vsc-foreground/40 text-[10px]">
          {t("common.loading")}
        </p>
      )}

      {/* Empty */}
      {!loading && workflows.length === 0 && (
        <p className="text-vsc-foreground/40 py-4 text-center text-[10px]">
          {t("computer.workflows.empty")}
        </p>
      )}

      {/* Workflow list */}
      {workflows.length > 0 && (
        <div className="space-y-1.5">
          {workflows.map((wf) => (
            <div key={wf.name} className="bg-vsc-input-background rounded p-2">
              {/* Workflow header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-vsc-foreground text-xs font-medium">
                    {wf.name}
                  </span>
                  <p className="text-vsc-foreground/50 mt-0.5 text-[10px] leading-tight">
                    {wf.description}
                  </p>
                  <div className="text-vsc-foreground/30 mt-1 flex gap-3 text-[9px]">
                    <span>
                      {wf.stepCount} {t("computer.workflows.steps")}
                    </span>
                    <span>~{formatDuration(wf.avgDurationMs)}</span>
                    {wf.variables.length > 0 && (
                      <span>
                        {wf.variables.length} {t("computer.workflows.vars")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleOpenRun(wf)}
                  className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-700"
                >
                  {runningWorkflow === wf.name
                    ? t("common.cancel")
                    : t("computer.workflows.run")}
                </button>
              </div>

              {/* Variable input form */}
              {runningWorkflow === wf.name && (
                <div className="mt-2 space-y-1.5 border-t border-zinc-700 pt-2">
                  {wf.variables.length === 0 ? (
                    <p className="text-vsc-foreground/40 text-[10px]">
                      {t("computer.workflows.noVars")}
                    </p>
                  ) : (
                    wf.variables.map((v) => (
                      <VariableInput
                        key={v.name}
                        variable={v}
                        value={variableValues[v.name]}
                        onChange={(val) => updateVariable(v.name, val)}
                      />
                    ))
                  )}
                  <button
                    onClick={() => handleRun(wf.name)}
                    className="rounded bg-green-600 px-2 py-0.5 text-[10px] text-white hover:bg-green-700"
                  >
                    {t("computer.workflows.execute")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VariableInput({
  variable,
  value,
  onChange,
}: {
  variable: WorkflowVariable;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (variable.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[10px]">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded"
        />
        <span className="text-vsc-foreground/70">{variable.name}</span>
        {variable.required && <span className="text-red-400">*</span>}
        <span className="text-vsc-foreground/30">{variable.description}</span>
      </label>
    );
  }

  return (
    <div>
      <label className="text-vsc-foreground/50 mb-0.5 block text-[9px]">
        {variable.name}
        {variable.required && <span className="text-red-400"> *</span>}
        {variable.description && (
          <span className="text-vsc-foreground/30 ml-1">
            {variable.description}
          </span>
        )}
      </label>
      <input
        type={variable.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(
            variable.type === "number"
              ? Number(e.target.value)
              : e.target.value,
          )
        }
        className="bg-vsc-input-background border-vsc-input-border text-vsc-foreground w-full rounded border px-2 py-0.5 text-[10px] focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
