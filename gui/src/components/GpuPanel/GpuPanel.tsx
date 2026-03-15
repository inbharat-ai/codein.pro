/**
 * CodeIn GPU Panel
 *
 * Full GPU management UI for RunPod integration.
 * - Connect with API key
 * - Browse available GPU types
 * - Create / stop / terminate pods
 * - Submit serverless jobs + check status
 * - Budget monitoring
 */
import React, { useEffect, useState } from "react";

import { GpuBudgetBar } from "./GpuBudgetBar";
import { GpuConnectTab } from "./GpuConnectTab";
import { GpuCreatePodForm } from "./GpuCreatePodForm";
import { GpuHeader } from "./GpuHeader";
import { GpuJobsTab } from "./GpuJobsTab";
import { GpuPodsTab } from "./GpuPodsTab";
import { GpuTypesTab } from "./GpuTypesTab";
import type { GpuTab } from "./gpu-types";
import { useGpuSession } from "./useGpuSession";
import "./GpuPanel.css";

const GpuPanel: React.FC = () => {
  const [tab, setTab] = useState<GpuTab>("connect");
  const [selectedGpu, setSelectedGpu] = useState("");
  const session = useGpuSession();

  // Check existing connection on mount
  useEffect(() => {
    if (!session.isOffline) {
      session.refreshStatus(tab, setTab);
    }
  }, [session.isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load data when switching tabs
  useEffect(() => {
    if (!session.connected) return;
    if (tab === "gpus") void session.loadGpuTypes();
    if (tab === "pods") void session.loadPods();
  }, [tab, session.connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStop = async () => {
    const stopped = await session.stop();
    if (stopped) setTab("connect");
  };

  return (
    <div className="gpu-panel">
      <GpuHeader connected={session.connected} onStop={handleStop} />

      {/* Offline banner */}
      {session.isOffline && (
        <div className="gpu-error">
          Agent is not running. Start the CodeIn agent to use GPU compute.
        </div>
      )}

      {/* Error banner */}
      {session.error && (
        <div className="gpu-error">
          {session.error}
          <button
            className="gpu-error__dismiss"
            onClick={() => session.setError(null)}
          >
            x
          </button>
        </div>
      )}

      {/* Budget bar */}
      {session.connected && session.status && (
        <GpuBudgetBar status={session.status} />
      )}

      {/* Tabs */}
      <div className="gpu-tabs">
        <button
          className={`gpu-tab ${tab === "connect" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("connect")}
        >
          Connect
        </button>
        <button
          className={`gpu-tab ${tab === "gpus" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("gpus")}
          disabled={!session.connected}
        >
          GPU Types
        </button>
        <button
          className={`gpu-tab ${tab === "pods" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("pods")}
          disabled={!session.connected}
        >
          Pods
        </button>
        <button
          className={`gpu-tab ${tab === "jobs" ? "gpu-tab--active" : ""}`}
          onClick={() => setTab("jobs")}
          disabled={!session.connected}
        >
          Jobs
        </button>
      </div>

      {/* Tab content */}
      {tab === "connect" && (
        <GpuConnectTab
          connected={session.connected}
          isOffline={session.isOffline}
          onConnect={session.connect}
          onConnected={() => setTab("gpus")}
        />
      )}

      {tab === "gpus" && (
        <>
          <GpuTypesTab
            gpuTypes={session.gpuTypes}
            selectedGpu={selectedGpu}
            loading={session.loading}
            onSelectGpu={setSelectedGpu}
            onRetry={session.loadGpuTypes}
          />
          <GpuCreatePodForm
            selectedGpu={selectedGpu}
            gpuTypes={session.gpuTypes}
            onCreatePod={session.createPod}
            onCreated={() => setTab("pods")}
          />
        </>
      )}

      {tab === "pods" && (
        <GpuPodsTab
          status={session.status}
          loading={session.loading}
          onStop={handleStop}
          onRefresh={session.loadPods}
          onSetTab={setTab}
        />
      )}

      {tab === "jobs" && (
        <GpuJobsTab
          onSubmitJob={session.submitJob}
          onCheckJob={session.checkJob}
        />
      )}
    </div>
  );
};

export default GpuPanel;
