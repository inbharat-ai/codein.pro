import { Editor, JSONContent } from "@tiptap/react";
import { InputModifiers } from "core";
import { useCallback } from "react";
import { useStore } from "react-redux";
import { useContext } from "react";
import { IdeMessengerContext } from "../../context/IdeMessenger";
import { useAppDispatch } from "../../redux/hooks";
import {
  selectDoneApplyStates,
  selectPendingToolCalls,
} from "../../redux/selectors/selectToolCalls";
import { selectCurrentOrg } from "../../redux/slices/profilesSlice";
import { cancelToolCall } from "../../redux/slices/sessionSlice";
import { setDialogMessage, setShowDialog } from "../../redux/slices/uiSlice";
import { streamEditThunk } from "../../redux/thunks/edit";
import { streamResponseThunk } from "../../redux/thunks/streamResponse";
import { cancelStream } from "../../redux/thunks/cancelStream";
import { RootState } from "../../redux/store";
import { getLocalStorage, setLocalStorage } from "../../util/localStorage";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import FeedbackDialog from "../../components/dialogs/FeedbackDialog";
import React from "react";

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
      // Background agent creation failed
      setIsCreatingAgent(false);
    }
  })();
}

export function useSendInput(setIsCreatingAgent: (v: boolean) => void) {
  const dispatch = useAppDispatch();
  const ideMessenger = useContext(IdeMessengerContext);
  const reduxStore = useStore<RootState>();

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

  return sendInput;
}
