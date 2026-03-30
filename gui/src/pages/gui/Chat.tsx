import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFindWidget } from "../../components/find/FindWidget";
import { useOnboardingCard } from "../../components/OnboardingCard";
import { TabBar } from "../../components/TabBar/TabBar";
import { useWebviewListener } from "../../hooks/useWebviewListener";
import { useAppDispatch, useAppSelector } from "../../redux/hooks";
import { updateToolCallOutput } from "../../redux/slices/sessionSlice";
import { selectSelectedChatModel } from "../../redux/slices/configSlice";
import { cancelStream } from "../../redux/thunks/cancelStream";
import { isJetBrains, isMetaEquivalentKeyPressed } from "../../util";
import { ImplementPreviewPanel } from "../../components/ImplementPreviewPanel";
import { ChatFooter } from "./ChatFooter";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { useSendInput } from "./useSendInput";

// eslint-disable-next-line no-barrel-files/no-barrel-files
export { MAIN_EDITOR_INPUT_ID } from "./chatConstants";

export function Chat() {
  const dispatch = useAppDispatch();
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
  const isInEdit = useAppSelector((store) => store.session.isInEdit);
  const lastSessionId = useAppSelector((state) => state.session.lastSessionId);
  const allSessionMetadata = useAppSelector(
    (state) => state.session.allSessionMetadata,
  );
  const hasDismissedExploreDialog = useAppSelector(
    (state) => state.ui.hasDismissedExploreDialog,
  );
  const mode = useAppSelector((state) => state.session.mode);
  const jetbrains = useMemo(() => isJetBrains(), []);

  const sendInput = useSendInput(setIsCreatingAgent);

  useEffect(() => {
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

  useWebviewListener(
    "newSession",
    async () => {
      mainTextInputRef.current?.focus?.();
    },
    [mainTextInputRef],
  );

  useWebviewListener(
    "toolCallPartialOutput",
    async (data) => {
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
      {!isInEdit && <ChatHeader modelTitle={modelTitle} />}

      <ChatMessageList
        history={history}
        stepsOpen={stepsOpen}
        isStreaming={isStreaming}
        showScrollbar={showScrollbar}
        sendInput={sendInput}
        isLastUserInput={isLastUserInput}
        highlights={highlights}
        stepsDivRef={stepsDivRef}
      />

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
