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
      <h3 className="text-codin-fg-secondary text-xs font-semibold">
        {t("computer.workflows.title")}
      </h3>

      {loading && (
        <p className="text-codin-fg-muted text-[10px]">{t("common.loading")}</p>
      )}

      {!loading && workflows.length === 0 && (
        <p className="text-codin-fg-muted py-4 text-center text-[10px]">
          {t("computer.workflows.empty")}
        </p>
      )}

      {workflows.length > 0 && (
        <div className="space-y-1.5">
          {workflows.map((wf) => (
            <div key={wf.name} className="bg-codin-bg-surface rounded-md p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-codin-fg text-xs font-medium">
                    {wf.name}
                  </span>
                  <p className="text-codin-fg-muted mt-0.5 text-[10px] leading-tight">
                    {wf.description}
                  </p>
                  <div className="text-codin-fg-muted mt-1 flex gap-3 text-[9px]">
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
                  className="bg-codin-indigo-600 hover:bg-codin-indigo-500 shrink-0 rounded-md px-2.5 py-1 text-[10px] font-medium text-white transition-colors"
                >
                  {runningWorkflow === wf.name
                    ? t("common.cancel")
                    : t("computer.workflows.run")}
                </button>
              </div>

              {runningWorkflow === wf.name && (
                <div className="border-codin-border mt-2 space-y-1.5 border-t pt-2">
                  {wf.variables.length === 0 ? (
                    <p className="text-codin-fg-muted text-[10px]">
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
                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-emerald-500"
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
          className="accent-codin-indigo-500 rounded"
        />
        <span className="text-codin-fg-secondary">{variable.name}</span>
        {variable.required && <span className="text-red-400">*</span>}
        <span className="text-codin-fg-muted">{variable.description}</span>
      </label>
    );
  }

  return (
    <div>
      <label className="text-codin-fg-muted mb-0.5 block text-[9px]">
        {variable.name}
        {variable.required && <span className="text-red-400"> *</span>}
        {variable.description && (
          <span className="text-codin-fg-muted ml-1">
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
        className="bg-codin-bg-surface border-codin-border text-codin-fg focus:border-codin-indigo-500 w-full rounded border px-2 py-1 text-[10px] focus:outline-none"
      />
    </div>
  );
}
