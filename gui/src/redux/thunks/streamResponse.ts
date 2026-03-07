import { createAsyncThunk, unwrapResult } from "@reduxjs/toolkit";
import { JSONContent } from "@tiptap/core";
import { InputModifiers } from "core";
import posthog from "posthog-js";
import { v4 as uuidv4 } from "uuid";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { translateToEnglish } from "../../util/translation";
import { selectSelectedChatModel } from "../slices/configSlice";
import {
  resetNextCodeBlockToApplyIndex,
  submitEditorAndInitAtIndex,
  updateHistoryItemAtIndex,
} from "../slices/sessionSlice";
import { ThunkApiType } from "../store";
import { routeUserInput } from "./chatRouter";
import { streamNormalInput } from "./streamNormalInput";
import { streamThunkWrapper } from "./streamThunkWrapper";
import { updateFileSymbolsFromFiles } from "./updateFileSymbols";

export const streamResponseThunk = createAsyncThunk<
  void,
  {
    editorState: JSONContent;
    modifiers: InputModifiers;
    index?: number;
  },
  ThunkApiType
>(
  "chat/streamResponse",
  async ({ editorState, modifiers, index }, { dispatch, extra, getState }) => {
    await dispatch(
      streamThunkWrapper(async () => {
        const state = getState();
        const selectedChatModel = selectSelectedChatModel(state);
        const inputIndex = index ?? state.session.history.length; // Either given index or concat to end

        if (!selectedChatModel) {
          throw new Error("No chat model selected");
        }
        dispatch(
          submitEditorAndInitAtIndex({ index: inputIndex, editorState }),
        );

        dispatch(resetNextCodeBlockToApplyIndex());

        const defaultContextProviders =
          state.config.config.experimental?.defaultContext ?? [];

        // Resolve context providers and construct new history
        const {
          selectedContextItems,
          selectedCode,
          content,
          legacyCommandWithInput,
        } = await resolveEditorContent({
          editorState,
          modifiers,
          ideMessenger: extra.ideMessenger,
          defaultContextProviders,
          availableSlashCommands: state.config.config.slashCommands,
          dispatch,
          getState,
        });

        // symbols for both context items AND selected codeblocks
        const filesForSymbols = [
          ...selectedContextItems
            .filter((item) => item.uri?.type === "file" && item?.uri?.value)
            .map((item) => item.uri!.value),
          ...selectedCode.map((rif) => rif.filepath),
        ];
        void dispatch(updateFileSymbolsFromFiles(filesForSymbols));

        const contentStr = typeof content === "string" ? content : "";
        const translation = await translateToEnglish(contentStr);
        const contentForModel = translation.translatedText
          ? `User language: ${translation.languageLabel}. Original message:\n${content}\n\nEnglish translation:\n${translation.translatedText}\n\nRespond in ${translation.languageLabel}.`
          : content;

        dispatch(
          updateHistoryItemAtIndex({
            index: inputIndex,
            updates: {
              message: {
                role: "user",
                content: contentForModel,
                id: uuidv4(),
              },
              contextItems: selectedContextItems,
            },
          }),
        );

        posthog.capture("step run", {
          step_name: "User Input",
          params: {},
        });
        posthog.capture("userInput", {});

        if (legacyCommandWithInput) {
          posthog.capture("step run", {
            step_name: legacyCommandWithInput.command.name,
            params: {},
          });
        }

        // Route based on input complexity
        const route = await routeUserInput(
          typeof contentForModel === "string" ? contentForModel : "",
          dispatch,
          getState,
        );

        if (route === "chat") {
          // Normal chat path
          unwrapResult(
            await dispatch(
              streamNormalInput({
                legacySlashCommandData: legacyCommandWithInput
                  ? {
                      command: legacyCommandWithInput.command,
                      contextItems: selectedContextItems,
                      historyIndex: inputIndex,
                      input: legacyCommandWithInput.input,
                      selectedCode,
                    }
                  : undefined,
              }),
            ),
          );
        }
        // Swarm path is handled directly by routeUserInput
      }),
    );
  },
);
