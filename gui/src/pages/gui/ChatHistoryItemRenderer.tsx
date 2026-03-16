import { ChatBubbleOvalLeftIcon } from "@heroicons/react/24/outline";
import { JSONContent } from "@tiptap/react";
import { InputModifiers } from "core";
import { renderChatMessage } from "core/util/messageContent";
import React from "react";
import TimelineItem from "../../components/gui/TimelineItem";
import ThinkingBlockPeek from "../../components/mainInput/belowMainInput/ThinkingBlockPeek";
import ContinueInputBox from "../../components/mainInput/ContinueInputBox";
import StepContainer from "../../components/StepContainer";
import { ChatHistoryItemWithMessageId } from "../../redux/slices/sessionSlice";
import { ToolCallDiv } from "./ToolCallDiv";

// Helper function to find the index of the latest conversation summary
function findLatestSummaryIndex(
  history: ChatHistoryItemWithMessageId[],
): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].conversationSummary) {
      return i;
    }
  }
  return -1; // No summary found
}

export const ChatHistoryItemRenderer = React.memo(
  function ChatHistoryItemRenderer({
    item,
    index,
    history,
    stepsOpen,
    isStreaming,
    sendInput,
    isLastUserInput,
  }: {
    item: ChatHistoryItemWithMessageId;
    index: number;
    history: ChatHistoryItemWithMessageId[];
    stepsOpen: (boolean | undefined)[];
    isStreaming: boolean;
    sendInput: (
      editorState: JSONContent,
      modifiers: InputModifiers,
      index?: number,
    ) => void;
    isLastUserInput: (index: number) => boolean;
  }) {
    const { message, editorState, contextItems, appliedRules, toolCallStates } =
      item;

    const latestSummaryIndex = findLatestSummaryIndex(history);
    const isBeforeLatestSummary =
      latestSummaryIndex !== -1 && index < latestSummaryIndex;

    if (message.role === "user") {
      return (
        <ContinueInputBox
          onEnter={(editorState, modifiers) =>
            sendInput(editorState, modifiers, index)
          }
          isLastUserInput={isLastUserInput(index)}
          isMainInput={false}
          editorState={editorState ?? item.message.content}
          contextItems={contextItems}
          appliedRules={appliedRules}
          inputId={message.id}
        />
      );
    }

    if (message.role === "tool") {
      return null;
    }

    if (message.role === "assistant") {
      return (
        <>
          {/* Always render assistant content through normal path */}
          <div className="thread-message">
            <TimelineItem
              item={item}
              iconElement={
                <ChatBubbleOvalLeftIcon width="16px" height="16px" />
              }
              open={
                typeof stepsOpen[index] === "undefined"
                  ? true
                  : stepsOpen[index]!
              }
              onToggle={() => {}}
            >
              <StepContainer
                index={index}
                isLast={index === history.length - 1}
                item={item}
                latestSummaryIndex={latestSummaryIndex}
              />
            </TimelineItem>
          </div>

          {toolCallStates && (
            <ToolCallDiv toolCallStates={toolCallStates} historyIndex={index} />
          )}
        </>
      );
    }

    if (message.role === "thinking") {
      return (
        <div className={isBeforeLatestSummary ? "opacity-50" : ""}>
          <ThinkingBlockPeek
            content={renderChatMessage(message)}
            redactedThinking={message.redactedThinking}
            index={index}
            prevItem={index > 0 ? history[index - 1] : null}
            inProgress={index === history.length - 1 && isStreaming}
            signature={message.signature}
          />
        </div>
      );
    }

    // Default case - regular assistant message
    return (
      <div className="thread-message">
        <TimelineItem
          item={item}
          iconElement={<ChatBubbleOvalLeftIcon width="16px" height="16px" />}
          open={
            typeof stepsOpen[index] === "undefined" ? true : stepsOpen[index]!
          }
          onToggle={() => {}}
        >
          <StepContainer
            index={index}
            isLast={index === history.length - 1}
            item={item}
            latestSummaryIndex={latestSummaryIndex}
          />
        </TimelineItem>
      </div>
    );
  },
);
