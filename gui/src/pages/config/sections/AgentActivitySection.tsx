import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState } from "../../../components/ui";
import { agentFetch } from "../../../util/agentConfig";
import { ConfigHeader } from "../components/ConfigHeader";

interface AgentActivityEntry {
  timestamp?: string;
  type?: string;
  action?: string;
  message?: string;
  level?: string;
  taskId?: string;
  query?: string;
}

interface AgentTaskSummary {
  id: string;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentLogEntry {
  level?: string;
  message?: string;
  step?: any;
  error?: string;
}

// Agent URL is now configured centrally via agentConfig.ts

export function AgentActivitySection() {
  const [activity, setActivity] = useState<AgentActivityEntry[]>([]);
  const [tasks, setTasks] = useState<AgentTaskSummary[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<AgentLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    try {
      const response = await agentFetch(`/agent/activity?limit=200`);
      const data = await response.json();
      setActivity(data.activity || []);
    } catch (err) {
      setError("Failed to load agent activity");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const response = await agentFetch(`/agent/tasks/list?limit=50`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError("Failed to load agent tasks");
    }
  }, []);

  const loadTaskLogs = useCallback(async (taskId: string) => {
    try {
      const response = await agentFetch(
        `/agent/tasks/logs?taskId=${encodeURIComponent(taskId)}&tail=200`,
      );
      const data = await response.json();
      setTaskLogs(data.logs || []);
    } catch (err) {
      setError("Failed to load task logs");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setError(null);
    await Promise.all([loadActivity(), loadTasks()]);
    if (selectedTaskId) {
      await loadTaskLogs(selectedTaskId);
    }
  }, [loadActivity, loadTasks, loadTaskLogs, selectedTaskId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const handleSelectTask = async (taskId: string) => {
    setSelectedTaskId(taskId);
    await loadTaskLogs(taskId);
  };

  return (
    <div>
      <ConfigHeader
        title="Agent Activity"
        subtext="Monitor agent tasks, research calls, and activity logs."
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={refreshAll}>Refresh</Button>
      </div>

      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-sm font-medium">Recent Activity</div>
          {activity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Agent activity will appear here once tasks or tools are used."
            />
          ) : (
            <div className="mt-3 max-h-72 overflow-y-auto text-xs">
              {activity.map((entry, index) => (
                <div key={index} className="border-b border-gray-700 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300">
                      {entry.type || "event"}
                    </span>
                    {entry.action && (
                      <span className="text-gray-500">{entry.action}</span>
                    )}
                    {entry.level && (
                      <span className="text-gray-500">{entry.level}</span>
                    )}
                  </div>
                  <div className="text-gray-400">
                    {entry.message || entry.query || entry.taskId || ""}
                  </div>
                  {entry.timestamp && (
                    <div className="text-gray-600">{entry.timestamp}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="text-sm font-medium">Agent Tasks</div>
          {tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="Start a task to see it tracked here."
            />
          ) : (
            <div className="mt-3 max-h-72 overflow-y-auto text-xs">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleSelectTask(task.id)}
                  className={`mb-2 flex w-full flex-col rounded border border-solid border-gray-700 p-2 text-left hover:border-gray-500 ${
                    selectedTaskId === task.id ? "bg-gray-800" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-200">
                      {task.title}
                    </span>
                    <span className="text-gray-500">{task.status}</span>
                  </div>
                  <div className="text-gray-500">{task.id}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <div className="text-sm font-medium">Task Logs</div>
          {selectedTaskId ? (
            taskLogs.length === 0 ? (
              <EmptyState
                title="No logs"
                description="No logs available for this task yet."
              />
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto font-mono text-xs">
                {taskLogs.map((log, index) => (
                  <div key={index} className="border-b border-gray-700 py-2">
                    <div className="text-gray-300">{log.level || "log"}</div>
                    <div className="text-gray-500">
                      {log.message || log.error || ""}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <EmptyState
              title="Select a task"
              description="Choose a task to view its logs and step outputs."
            />
          )}
        </Card>
      </div>
    </div>
  );
}
