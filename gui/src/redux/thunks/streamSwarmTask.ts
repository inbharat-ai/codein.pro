/**
 * Swarm Task Thunk
 *
 * Orchestrates complex multi-step tasks through the CodIn MAS.
 * Used for refactoring, planning, architecture, and other multi-agent work.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import { v4 as uuidv4 } from "uuid";
import { getAgentBaseUrl } from "../../util/agentConfig";
import {
  addPromptCompletionPair,
  setActive,
  setInactive,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { swarmFetch } from "../slices/swarmSlice";
import { ThunkApiType } from "../store";

export const streamSwarmTask = createAsyncThunk<
  void,
  {
    goal: string;
    context?: Record<string, any>;
    historyIndex: number;
  },
  ThunkApiType
>(
  "chat/streamSwarmTask",
  async ({ goal, context, historyIndex }, { dispatch }) => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;

    try {
      // Check if agent server is available
      try {
        await swarmFetch("/status");
      } catch {
        throw new Error(
          "Agent server not available. Starting up or connection error.",
        );
      }

      // Add initial message to history
      const taskId = uuidv4();
      dispatch(
        updateHistoryItemAtIndex({
          index: historyIndex,
          updates: {
            message: {
              role: "user",
              content: goal,
              id: taskId,
            },
          },
        }),
      );

      dispatch(setActive());

      // Submit task to swarm
      posthog.capture("swarm_task_submitted", {
        goal: goal.substring(0, 100),
        hasContext: !!context,
      });

      const taskResponse = await swarmFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          goal,
          topology: "hierarchical",
          context: {
            ...context,
            source: "vscode_gui",
          },
        }),
      });

      // Poll for task completion or stream events
      let lastStatus = taskResponse.status;
      let accumulatedContent = `Task ID: ${taskResponse.taskId}\n\n`;

      // Create assistant message for the response
      dispatch(
        updateHistoryItemAtIndex({
          index: historyIndex,
          updates: {
            message: {
              role: "assistant",
              content: accumulatedContent,
              id: uuidv4(),
            },
          },
        }),
      );

      pollInterval = setInterval(async () => {
        try {
          const status = await swarmFetch(`/tasks/${taskResponse.taskId}`);

          if (status.status !== lastStatus) {
            accumulatedContent += `\nTask status: ${status.status}\n`;
            dispatch(
              updateHistoryItemAtIndex({
                index: historyIndex,
                updates: {
                  message: {
                    role: "assistant",
                    content: accumulatedContent,
                    id: taskResponse.taskId,
                  },
                },
              }),
            );
            lastStatus = status.status;
          }

          if (
            status.status === "completed" ||
            status.status === "failed" ||
            status.status === "cancelled"
          ) {
            clearInterval(pollInterval);

            if (status.status === "completed") {
              // Get results
              try {
                const results = await swarmFetch(
                  `/tasks/${taskResponse.taskId}/results`,
                );

                const completionContent = JSON.stringify(results, null, 2);
                accumulatedContent += `\n\nResults:\n${completionContent}`;

                dispatch(
                  updateHistoryItemAtIndex({
                    index: historyIndex,
                    updates: {
                      message: {
                        role: "assistant",
                        content: accumulatedContent,
                        id: taskResponse.taskId,
                      },
                    },
                  }),
                );

                dispatch(
                  addPromptCompletionPair([
                    {
                      prompt: goal,
                      completion: accumulatedContent,
                      modelTitle: "swarm",
                      modelProvider: "swarm",
                    },
                  ]),
                );

                posthog.capture("swarm_task_completed", {
                  taskId: taskResponse.taskId,
                  resultSize: completionContent.length,
                });
              } catch (err) {
                console.error("Error fetching task results", err);
                accumulatedContent += `\n\nTask completed with ID ${taskResponse.taskId}`;
                dispatch(
                  updateHistoryItemAtIndex({
                    index: historyIndex,
                    updates: {
                      message: {
                        role: "assistant",
                        content: accumulatedContent,
                        id: taskResponse.taskId,
                      },
                    },
                  }),
                );
              }
            } else {
              accumulatedContent += `\n\nTask ${status.status}`;
              dispatch(
                updateHistoryItemAtIndex({
                  index: historyIndex,
                  updates: {
                    message: {
                      role: "assistant",
                      content: accumulatedContent,
                      id: taskResponse.taskId,
                    },
                  },
                }),
              );

              posthog.capture("swarm_task_failed", {
                taskId: taskResponse.taskId,
                reason: status.status,
              });
            }
          }
        } catch (pollErr) {
          console.error("Error polling task status", pollErr);
          clearInterval(pollInterval);
        }
      }, 1000); // Poll every 1 second

      // Also listen for real-time events via SSE
      try {
        const base = getAgentBaseUrl();
        eventSource = new EventSource(`${base}/swarm/events`);
        eventSource.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.taskId === taskResponse.taskId) {
              accumulatedContent += `\n[${parsed.type}] ${JSON.stringify(parsed.data)}`;
              dispatch(
                updateHistoryItemAtIndex({
                  index: historyIndex,
                  updates: {
                    message: {
                      role: "assistant",
                      content: accumulatedContent,
                      id: taskResponse.taskId,
                    },
                  },
                }),
              );
            }
          } catch {
            /* ignore parse errors */
          }
        };
      } catch {
        /* SSE not critical — polling handles it */
      }
    } catch (error: any) {
      console.error("Swarm task error", error);

      dispatch(
        updateHistoryItemAtIndex({
          index: historyIndex,
          updates: {
            message: {
              role: "assistant",
              content: `Error: ${error.message || "Unknown error"}`,
              id: uuidv4(),
            },
          },
        }),
      );

      posthog.capture("swarm_task_error", {
        error: error?.message || "unknown",
      });
    } finally {
      dispatch(setInactive());
      if (pollInterval) clearInterval(pollInterval);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    }
  },
);
