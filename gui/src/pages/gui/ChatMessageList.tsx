import { JSONContent } from "@tiptap/react";
import { InputModifiers } from "core";
import React, { useRef } from "react";
import { ErrorBoundary } from "react-error-boundary";
import InlineErrorMessage from "../../components/mainInput/InlineErrorMessage";
import { useAppDispatch } from "../../redux/hooks";
import {
  ChatHistoryItemWithMessageId,
  newSession,
} from "../../redux/slices/sessionSlice";
import { useAutoScroll } from "./useAutoScroll";
import { ChatHistoryItemRenderer } from "./ChatHistoryItemRenderer";
import { fallbackRender } from "./ChatMessageErrorFallback";

interface ChatMessageListProps {
  history: ChatHistoryItemWithMessageId[];
  stepsOpen: (boolean | undefined)[];
  isStreaming: boolean;
  showScrollbar: boolean;
  sendInput: (
    editorState: JSONContent,
    modifiers: InputModifiers,
    index?: number,
  ) => void;
  isLastUserInput: (index: number) => boolean;
  highlights: React.ReactNode;
  stepsDivRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessageList = React.memo(function ChatMessageList({
  history,
  stepsOpen,
  isStreaming,
  showScrollbar,
  sendInput,
  isLastUserInput,
  highlights,
  stepsDivRef,
}: ChatMessageListProps) {
  const dispatch = useAppDispatch();

  useAutoScroll(stepsDivRef, history);

  return (
    <div
      ref={stepsDivRef}
      className={`relative overflow-y-scroll pt-[8px] [&>*]:relative [&_.thread-message]:ml-px ${showScrollbar ? "thin-scrollbar" : "no-scrollbar"} ${history.length > 0 ? "flex-1" : ""}`}
      style={{ backgroundColor: "transparent" }}
    >
      {highlights}
      {history
        .filter((item) => item.message.role !== "system")
        .map((item, index: number) => (
          <div
            key={item.message.id}
            style={{
              minHeight: index === history.length - 1 ? "200px" : 0,
            }}
          >
            <ErrorBoundary
              FallbackComponent={fallbackRender}
              onReset={() => {
                dispatch(newSession());
              }}
            >
              <ChatHistoryItemRenderer
                item={item}
                index={index}
                history={history}
                stepsOpen={stepsOpen}
                isStreaming={isStreaming}
                sendInput={sendInput}
                isLastUserInput={isLastUserInput}
              />
            </ErrorBoundary>
            {index === history.length - 1 && <InlineErrorMessage />}
          </div>
        ))}
    </div>
  );
});
