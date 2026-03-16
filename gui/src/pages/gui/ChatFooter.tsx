import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Editor, JSONContent } from "@tiptap/react";
import { InputModifiers } from "core";
import React from "react";
import { BackgroundModeView } from "../../components/BackgroundMode/BackgroundModeView";
import { CliInstallBanner } from "../../components/CliInstallBanner";
import { FatalErrorIndicator } from "../../components/config/FatalErrorNotice";
import ContinueInputBox from "../../components/mainInput/ContinueInputBox";
import { NewSessionButton } from "../../components/mainInput/belowMainInput/NewSessionButton";
import { VibeModeView } from "../../components/VibeModeView";
import { VoicePanel } from "../../components/VoicePanel";
import { useAppDispatch } from "../../redux/hooks";
import { ChatHistoryItemWithMessageId } from "../../redux/slices/sessionSlice";
import { loadLastSession } from "../../redux/thunks/session";
import { EmptyChatBody } from "./EmptyChatBody";
import { ExploreDialogWatcher } from "./ExploreDialogWatcher";
import { MAIN_EDITOR_INPUT_ID } from "./Chat";

export const ChatFooter = React.memo(function ChatFooter({
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
