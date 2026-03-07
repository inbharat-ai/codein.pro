/**
 * Swarm Task Thunk
 *
 * Orchestrates complex multi-step tasks through the CodIn MAS.
 * Used for refactoring, planning, architecture, and other multi-agent work.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import { v4 as uuidv4 } from "uuid";
import { SwarmCommunicator } from "../../util/SwarmCommunicator";
import {
  addPromptCompletionPair,
  setActive,
  setInactive,
  streamUpdate,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
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
  async ({ goal, context, historyIndex }, { dispatch, getState }) => {
    const state = getState();
    const communicator = new SwarmCommunicator();

    try {
      // Check if agent server is available
      const available = await communicator.isAvailable();
      if (!available) {
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

      const taskResponse = await communicator.submitTask({
        goal,
        topology: "hierarchical", // Default to hierarchical
        context: {
          ...context,
          source: "vscode_gui",
        },
      });

      // Poll for task completion or stream events
      let lastStatus = taskResponse.status;
      const pollInterval = setInterval(async () => {
        try {
          const status = await communicator.getTaskStatus(taskResponse.taskId);

          if (status.status !== lastStatus) {
            dispatch(
              streamUpdate({
                index: historyIndex,
                content: `Task status: ${status.status}`,
                done:
                  status.status === "completed" || status.status === "failed",
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
                const results = await communicator.getTaskResults(
                  taskResponse.taskId,
                );

                const completionContent = JSON.stringify(results, null, 2);

                dispatch(
                  streamUpdate({
                    index: historyIndex,
                    content: completionContent,
                    done: true,
                  }),
                );

                dispatch(
                  addPromptCompletionPair({
                    index: historyIndex,
                    completion: completionContent,
                  }),
                );

                posthog.capture("swarm_task_completed", {
                  taskId: taskResponse.taskId,
                  resultSize: completionContent.length,
                });
              } catch (err) {
                console.error("Error fetching task results", err);
                dispatch(
                  streamUpdate({
                    index: historyIndex,
                    content: `Task completed with ID ${taskResponse.taskId}`,
                    done: true,
                  }),
                );
              }
            } else {
              dispatch(
                streamUpdate({
                  index: historyIndex,
                  content: `Task ${status.status}`,
                  done: true,
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

      // Also listen for real-time events
      communicator.addEventListener((event) => {
        if (event.taskId === taskResponse.taskId) {
          dispatch(
            streamUpdate({
              index: historyIndex,
              content: `[${event.type}] ${JSON.stringify(event.data)}`,
              done: false,
            }),
          );
        }
      });
    } catch (error: any) {
      console.error("Swarm task error", error);

      dispatch(
        streamUpdate({
          index: historyIndex,
          content: `Error: ${error.message || "Unknown error"}`,
          done: true,
        }),
      );

      posthog.capture("swarm_task_error", {
        error: error?.message || "unknown",
      });
    } finally {
      dispatch(setInactive());
      communicator.dispose();
    }
  },
);
