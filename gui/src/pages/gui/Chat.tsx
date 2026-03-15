import {
  ArrowLeftIcon,
  ChatBubbleOvalLeftIcon,
} from "@heroicons/react/24/outline";
import { Editor, JSONContent } from "@tiptap/react";
import { ChatHistoryItem, InputModifiers } from "core";
import { renderChatMessage } from "core/util/messageContent";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "react-error-boundary";
import styled from "styled-components";
import { Button, lightGray, vscBackground } from "../../components";
import { useFindWidget } from "../../components/find/FindWidget";
import TimelineItem from "../../components/gui/TimelineItem";
import { NewSessionButton } from "../../components/mainInput/belowMainInput/NewSessionButton";
import ThinkingBlockPeek from "../../components/mainInput/belowMainInput/ThinkingBlockPeek";
import ContinueInputBox from "../../components/mainInput/ContinueInputBox";
import { useOnboardingCard } from "../../components/OnboardingCard";
import StepContainer from "../../components/StepContainer";
import { TabBar } from "../../components/TabBar/TabBar";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import {
  selectDoneApplyStates,
  selectPendingToolCalls,
} from "../../redux/selectors/selectToolCalls";
import { selectCurrentOrg } from "../../redux/slices/profilesSlice";
import {
  cancelToolCall,
  ChatHistoryItemWithMessageId,
  newSession,
  updateToolCallOutput,
} from "../../redux/slices/sessionSlice";
import { streamEditThunk } from "../../redux/thunks/edit";
import { loadLastSession } from "../../redux/thunks/session";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import { isJetBrains, isMetaEquivalentKeyPressed } from "../../util";
import { ToolCallDiv } from "./ToolCallDiv";

import { useStore } from "react-redux";
import { BackgroundModeView } from "../../components/BackgroundMode/BackgroundModeView";
import { VibeModeView } from "../../components/VibeModeView";
import { CliInstallBanner } from "../../components/CliInstallBanner";
import FeedbackDialog from "../../components/dialogs/FeedbackDialog";
import { ImplementPreviewPanel } from "../../components/ImplementPreviewPanel";
import { ModeSelector } from "../../components/ModeSelector";
import { VoicePanel } from "../../components/VoicePanel";

import { FatalErrorIndicator } from "../../components/config/FatalErrorNotice";
import InlineErrorMessage from "../../components/mainInput/InlineErrorMessage";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { ModelBadge } from "../../components/ModelBadge";
import { SovereignModeBadge } from "../../components/SovereignModeBadge";
import { selectSelectedChatModel } from "../../redux/slices/configSlice";
import { setDialogMessage, setShowDialog } from "../../redux/slices/uiSlice";
import { RootState } from "../../redux/store";
import { cancelStream } from "../../redux/thunks/cancelStream";
import { getLocalStorage, setLocalStorage } from "../../util/localStorage";
import { EmptyChatBody } from "./EmptyChatBody";
import { ExploreDialogWatcher } from "./ExploreDialogWatcher";
import { useAutoScroll } from "./useAutoScroll";

// Helper function to find the index of the latest conversation summary
function findLatestSummaryIndex(history: ChatHistoryItem[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].conversationSummary) {
      return i;
    }
  }
  return -1; // No summary found
}

const StepsDiv = styled.div`
  position: relative;
  background-color: transparent;

  & > * {
    position: relative;
  }

  .thread-message {
    margin: 0 0 0 1px;
  }
`;

export const MAIN_EDITOR_INPUT_ID = "main-editor-input";

function fallbackRender({ error, resetErrorBoundary }: any) {
  // Call resetErrorBoundary() to reset the error boundary and retry the render.

  return (
    <div
      role="alert"
      className="px-2"
      style={{ backgroundColor: vscBackground }}
    >
      <p>Something went wrong:</p>
      <pre style={{ color: "red" }}>{error.message}</pre>
      <pre style={{ color: lightGray }}>{error.stack}</pre>

      <div className="text-center">
        <Button onClick={resetErrorBoundary}>Restart</Button>
      </div>
    </div>
  );
}

function handleBackgroundMode({
  stateSnapshot,
  editorState,
  modifiers,
  editorToClearOnSend,
  ideMessenger,
  dispatch,
  reduxStore,
  setIsCreatingAgent,
}: {
  stateSnapshot: RootState;
  editorState: JSONContent;
  modifiers: InputModifiers;
  editorToClearOnSend?: Editor;
  ideMessenger: any;
  dispatch: any;
  reduxStore: any;
  setIsCreatingAgent: (v: boolean) => void;
}) {
  const currentOrg = selectCurrentOrg(stateSnapshot);
  const organizationId =
    currentOrg?.id !== "personal" ? currentOrg?.id : undefined;

  setIsCreatingAgent(true);

  void (async () => {
    try {
      const defaultContextProviders =
        stateSnapshot.config.config.experimental?.defaultContext ?? [];

      const { selectedContextItems, selectedCode, content } =
        await resolveEditorContent({
          editorState,
          modifiers,
          ideMessenger,
          defaultContextProviders,
          availableSlashCommands: stateSnapshot.config.config.slashCommands,
          dispatch,
          getState: () => reduxStore.getState(),
        });

      await ideMessenger.request("createBackgroundAgent", {
        content,
        contextItems: selectedContextItems,
        selectedCode,
        organizationId,
      });

      if (editorToClearOnSend) {
        editorToClearOnSend.commands.clearContent();
      }

      setIsCreatingAgent(false);
    } catch (error) {
      console.error("Failed to create background agent:", error);
      setIsCreatingAgent(false);
    }
  })();
}

const ChatHistoryItemRenderer = React.memo(function ChatHistoryItemRenderer({
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
});

const ChatFooter = React.memo(function ChatFooter({
  sendInput,
  allSessionMetadata,
  isStreaming,
  history,
  lastSessionId,
  isInEdit,
  hasDismissedExploreDialog,
  mode,
  isCreatingAgent,
  onboardingCard,
}: {
  sendInput: (
    editorState: JSONContent,
    modifiers: InputModifiers,
    index?: number,
    editorToClearOnSend?: Editor,
  ) => void;
  allSessionMetadata: any[];
  isStreaming: boolean;
  history: ChatHistoryItemWithMessageId[];
  lastSessionId: string | undefined;
  isInEdit: boolean;
  hasDismissedExploreDialog: boolean;
  mode: string;
  isCreatingAgent: boolean;
  onboardingCard: { show: boolean | undefined };
}) {
  const dispatch = useAppDispatch();

  return (
    <div className={"relative"}>
      <ContinueInputBox
        isMainInput
        isLastUserInput={false}
        onEnter={(editorState, modifiers, editor) =>
          sendInput(editorState, modifiers, undefined, editor)
        }
        inputId={MAIN_EDITOR_INPUT_ID}
      />

      <CliInstallBanner
        sessionCount={allSessionMetadata.length}
        sessionThreshold={3}
        permanentDismissal={true}
      />

      <div
        style={{
          pointerEvents: isStreaming ? "none" : "auto",
        }}
      >
        <div className="flex flex-row items-center justify-between pb-1 pl-0.5 pr-2">
          <div className="xs:inline hidden">
            {history.length === 0 && lastSessionId && !isInEdit && (
              <NewSessionButton
                onClick={async () => {
                  await dispatch(loadLastSession());
                }}
                className="flex items-center gap-2"
              >
                <ArrowLeftIcon className="h-3 w-3" />
                <span className="text-xs">Last Session</span>
              </NewSessionButton>
            )}
          </div>
          <VoicePanel />
        </div>
        <FatalErrorIndicator />
        {!hasDismissedExploreDialog && <ExploreDialogWatcher />}
        {mode === "background" ? (
          <BackgroundModeView isCreatingAgent={isCreatingAgent} />
        ) : mode === "vibe" ? (
          <VibeModeView />
        ) : (
          history.length === 0 && (
            <EmptyChatBody showOnboardingCard={onboardingCard.show} />
          )
        )}
      </div>
    </div>
  );
});

export function Chat() {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const reduxStore = useStore<RootState>();
  const onboardingCard = useOnboardingCard();
  const showSessionTabs = useAppSelector(
    (store) => store.config.config.ui?.showSessionTabs,
  );
  const isStreaming = useAppSelector((state) => state.session.isStreaming);
  const [stepsOpen] = useState<(boolean | undefined)[]>([]);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const mainTextInputRef = useRef<HTMLInputElement>(null);
  const stepsDivRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const history = useAppSelector((state) => state.session.history);
  const showChatScrollbar = useAppSelector(
    (state) => state.config.config.ui?.showChatScrollbar,
  );
  const codeToEdit = useAppSelector((state) => state.editModeState.codeToEdit);
  const isInEdit = useAppSelector((store) => store.session.isInEdit);

  const lastSessionId = useAppSelector((state) => state.session.lastSessionId);
  const allSessionMetadata = useAppSelector(
    (state) => state.session.allSessionMetadata,
  );
  const hasDismissedExploreDialog = useAppSelector(
    (state) => state.ui.hasDismissedExploreDialog,
  );
  const mode = useAppSelector((state) => state.session.mode);
  const currentOrg = useAppSelector(selectCurrentOrg);
  const jetbrains = useMemo(() => {
    return isJetBrains();
  }, []);

  useAutoScroll(stepsDivRef, history);

  useEffect(() => {
    // Cmd + Backspace to delete current step
    const listener = (e: KeyboardEvent) => {
      if (
        e.key === "Backspace" &&
        (jetbrains ? e.altKey : isMetaEquivalentKeyPressed(e)) &&
        !e.shiftKey
      ) {
        void dispatch(cancelStream());
      }
    };
    window.addEventListener("keydown", listener);

    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [isStreaming, jetbrains, isInEdit]);

  const { widget, highlights } = useFindWidget(
    stepsDivRef,
    tabsRef,
    isStreaming,
  );

  const sendInput = useCallback(
    (
      editorState: JSONContent,
      modifiers: InputModifiers,
      index?: number,
      editorToClearOnSend?: Editor,
    ) => {
      const stateSnapshot = reduxStore.getState();
      const latestPendingToolCalls = selectPendingToolCalls(stateSnapshot);
      const latestPendingApplyStates = selectDoneApplyStates(stateSnapshot);
      const isCurrentlyInEdit = stateSnapshot.session.isInEdit;
      const codeToEditSnapshot = stateSnapshot.editModeState.codeToEdit;
      const selectedModelByRole =
        stateSnapshot.config.config.selectedModelByRole;
      const currentMode = stateSnapshot.session.mode;

      // Handle background mode specially
      if (currentMode === "background" && !isCurrentlyInEdit) {
        handleBackgroundMode({
          stateSnapshot,
          editorState,
          modifiers,
          editorToClearOnSend,
          ideMessenger,
          dispatch,
          reduxStore,
          setIsCreatingAgent,
        });
        return;
      }

      // Cancel all pending tool calls
      latestPendingToolCalls.forEach((toolCallState) => {
        dispatch(
          cancelToolCall({
            toolCallId: toolCallState.toolCallId,
          }),
        );
      });

      // Reject all pending apply states
      latestPendingApplyStates.forEach((applyState) => {
        if (applyState.status !== "closed") {
          ideMessenger.post("rejectDiff", applyState);
        }
      });
      const model = isCurrentlyInEdit
        ? (selectedModelByRole.edit ?? selectedModelByRole.chat)
        : selectedModelByRole.chat;

      if (!model) {
        return;
      }

      if (isCurrentlyInEdit && codeToEditSnapshot.length === 0) {
        return;
      }

      if (isCurrentlyInEdit) {
        void dispatch(
          streamEditThunk({
            editorState,
            codeToEdit: codeToEditSnapshot,
          }),
        );
      } else {
        void dispatch(streamResponseThunk({ editorState, modifiers, index }));

        if (editorToClearOnSend) {
          editorToClearOnSend.commands.clearContent();
        }
      }

      // Increment localstorage counter for popup
      const currentCount = getLocalStorage("mainTextEntryCounter");
      if (currentCount) {
        setLocalStorage("mainTextEntryCounter", currentCount + 1);
        if (currentCount === 300) {
          dispatch(setDialogMessage(<FeedbackDialog />));
          dispatch(setShowDialog(true));
        }
      } else {
        setLocalStorage("mainTextEntryCounter", 1);
      }
    },
    [dispatch, ideMessenger, reduxStore, setIsCreatingAgent],
  );

  useWebviewListener(
    "newSession",
    async () => {
      // unwrapResult(response) // errors if session creation failed
      mainTextInputRef.current?.focus?.();
    },
    [mainTextInputRef],
  );

  // Handle partial tool call output for streaming updates
  useWebviewListener(
    "toolCallPartialOutput",
    async (data) => {
      // Update tool call output in Redux store
      dispatch(
        updateToolCallOutput({
          toolCallId: data.toolCallId,
          contextItems: data.contextItems,
        }),
      );
    },
    [dispatch],
  );

  const isLastUserInput = useCallback(
    (index: number): boolean => {
      return !history
        .slice(index + 1)
        .some((entry) => entry.message.role === "user");
    },
    [history],
  );

  const showScrollbar = showChatScrollbar ?? window.innerHeight > 5000;

  const selectedChatModel = useAppSelector(selectSelectedChatModel);
  const modelTitle = selectedChatModel?.title || selectedChatModel?.model || "";

  return (
    <>
      {!!showSessionTabs && !isInEdit && <TabBar ref={tabsRef} />}
      {widget}
      {!isInEdit && (
        <div className="flex items-center gap-2 px-2 py-1">
          <ModeSelector />
          <div className="ml-auto flex items-center gap-1.5">
            {modelTitle && <ModelBadge model={modelTitle} compact />}
            <SovereignModeBadge compact alwaysShow />
          </div>
        </div>
      )}

      <StepsDiv
        ref={stepsDivRef}
        className={`overflow-y-scroll pt-[8px] ${showScrollbar ? "thin-scrollbar" : "no-scrollbar"} ${history.length > 0 ? "flex-1" : ""}`}
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
      </StepsDiv>
      <ImplementPreviewPanel />
      <ChatFooter
        sendInput={sendInput}
        allSessionMetadata={allSessionMetadata}
        isStreaming={isStreaming}
        history={history}
        lastSessionId={lastSessionId}
        isInEdit={isInEdit}
        hasDismissedExploreDialog={hasDismissedExploreDialog}
        mode={mode}
        isCreatingAgent={isCreatingAgent}
        onboardingCard={onboardingCard}
      />
    </>
  );
}
