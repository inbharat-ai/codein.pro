/**
 * Chat Router - Routes user input to appropriate handler
 *
 * - Simple chat → streamNormalInput (fast path, local LLM)
 * - Complex tasks → streamSwarmTask (multi-agent orchestration)
 */

import {
  classifyInputComplexity,
  getExplicitMultiAgentRequest,
} from "../../util/taskClassifier";
import { streamNormalInput } from "./streamNormalInput";
import { streamSwarmTask } from "./streamSwarmTask";

export async function routeUserInput(
  userInput: string,
  dispatch: any,
  getState: any,
): Promise<"swarm" | "chat"> {
  // Check for explicit multi-agent request
  const explicitRequest = getExplicitMultiAgentRequest(userInput);
  if (explicitRequest) {
    console.log(
      "[Router] Explicit multi-agent request detected for goal:",
      explicitRequest.goal,
    );

    const state = getState();
    const historyIndex = state.session.history.length;

    dispatch(
      streamSwarmTask({
        goal: explicitRequest.goal,
        context: {
          userIntent: userInput,
        },
        historyIndex,
      }),
    );
    return "swarm";
  }

  // Classify complexity
  const classification = classifyInputComplexity(userInput);

  console.log("[Router] Task classification:", {
    isComplex: classification.isComplex,
    reason: classification.reason,
    confidence: classification.confidence,
  });

  // If complex, route to swarm
  if (classification.isComplex && classification.confidence > 0.5) {
    console.log("[Router] Routing to multi-agent swarm");

    const state = getState();
    const historyIndex = state.session.history.length;

    dispatch(
      streamSwarmTask({
        goal: userInput,
        context: {
          classification,
        },
        historyIndex,
      }),
    );
    return "swarm";
  }

  // Otherwise use normal chat
  console.log("[Router] Routing to local LLM chat");
  dispatch(streamNormalInput({}));
  return "chat";
}
