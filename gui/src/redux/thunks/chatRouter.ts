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

  // If complex, route to swarm
  if (classification.isComplex && classification.confidence > 0.5) {
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
  dispatch(streamNormalInput({}));
  return "chat";
}
