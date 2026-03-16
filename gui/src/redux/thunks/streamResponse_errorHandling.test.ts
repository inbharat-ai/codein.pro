import { JSONContent } from "@tiptap/core";
import { InputModifiers } from "core";
import { describe, expect, it, vi } from "vitest";
import { createMockStore, getEmptyRootState } from "../../util/test/mockStore";
import { streamResponseThunk } from "./streamResponse";

// Mock external dependencies only - let selectors run naturally
// Removed: modelSupportsNativeTools - let it run naturally

// Removed: addSystemMessageToolsToSystemMessage - let it run naturally

// Mock system message construction to keep test readable
vi.mock("../util/getBaseSystemMessage", () => ({
  getBaseSystemMessage: vi.fn(),
}));

import { getBaseSystemMessage } from "../util/getBaseSystemMessage";

// Removed: shouldAutoEnableSystemMessageTools - let it run naturally

// Additional mocks for streamResponseThunk
vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
  },
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid-123"),
}));

vi.mock(
  "../../components/mainInput/TipTapEditor/utils/resolveEditorContent",
  () => ({
    resolveEditorContent: vi.fn(),
  }),
);

import { unwrapResult } from "@reduxjs/toolkit";
import posthog from "posthog-js";
import { resolveEditorContent } from "../../components/mainInput/TipTapEditor/utils/resolveEditorContent";
import { MockIdeMessenger } from "../../context/MockIdeMessenger";
import { getRootStateWithClaude } from "./streamResponse.test";

const mockGetBaseSystemMessage = vi.mocked(getBaseSystemMessage);

const mockPosthog = vi.mocked(posthog);
const mockResolveEditorContent = vi.mocked(resolveEditorContent);

// Mock editor state (what user types in the input)
const mockEditorState: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Hello, please help me with this code" }],
    },
  ],
};

// Mock input modifiers (codebase context, etc.)
const mockModifiers: InputModifiers = {
  useCodebase: true,
  noContext: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveEditorContent.mockResolvedValue({
    selectedContextItems: [],
    selectedCode: [],
    content: "Hello, please help me with this code",
    legacyCommandWithInput: undefined,
  });

  // Mock getBaseSystemMessage to return simple system message for readable tests
  mockGetBaseSystemMessage.mockReturnValue("You are a helpful assistant.");
});

describe("streamResponseThunk", () => {
  it("should throw error when no chat model is selected", async () => {
    const noModelState = getEmptyRootState();
    noModelState.session.history = [
      {
        message: { id: "1", role: "user", content: "Hello" },
        contextItems: [],
      },
    ];

    // Create store with no selected chat model
    const mockStoreNoModel = createMockStore(noModelState);
    const requestSpy = vi.spyOn(mockStoreNoModel.mockIdeMessenger, "request");
    const chatSpy = vi.spyOn(
      mockStoreNoModel.mockIdeMessenger,
      "llmStreamChat",
    );

    // Execute thunk and expect it to be rejected
    const result = await mockStoreNoModel.dispatch(
      streamResponseThunk({
        editorState: mockEditorState,
        modifiers: mockModifiers,
      }) as any,
    );

    // Verify the thunk completed successfully but shows error dialog
    expect(result.type).toBe("chat/streamResponse/fulfilled");

    // Verify key error handling actions (flexible: runtime may dispatch additional actions)
    const dispatchedActions = mockStoreNoModel.getActions();
    const actionTypes = dispatchedActions.map((a: any) => a.type);

    // Verify first and last actions
    expect(actionTypes[0]).toBe("chat/streamResponse/pending");
    expect(actionTypes[actionTypes.length - 1]).toBe(
      "chat/streamResponse/fulfilled",
    );

    // Verify cancel/error flow actions
    expect(actionTypes).toContain("chat/cancelStream/pending");
    expect(actionTypes).toContain("session/setInactive");
    expect(actionTypes).toContain("session/abortStream");
    expect(actionTypes).toContain("session/clearDanglingMessages");
    expect(actionTypes).toContain("chat/cancelStream/fulfilled");
    expect(actionTypes).toContain("ui/setDialogMessage");
    expect(actionTypes).toContain("ui/setShowDialog");

    // Verify the error dialog payload
    const dialogAction = dispatchedActions.find(
      (a: any) => a.type === "ui/setDialogMessage",
    );
    expect(dialogAction?.payload).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          error: expect.objectContaining({
            message: "No chat model selected",
          }),
        }),
      }),
    );

    // Verify no IDE messenger calls were made
    expect(requestSpy).not.toHaveBeenCalled();
    expect(chatSpy).not.toHaveBeenCalled();

    // Verify final state shows error dialog and inactive streaming
    const finalState = mockStoreNoModel.getState();
    expect(finalState).toEqual({
      ...noModelState,
      session: {
        ...noModelState.session,
        streamAborter: expect.any(AbortController),
        history: [
          { ...noModelState.session.history[0], isGatheringContext: false },
        ],
      },
      ui: {
        ...noModelState.ui,
        showDialog: true, // Error dialog is shown
        dialogMessage: expect.objectContaining({
          props: expect.objectContaining({
            error: expect.objectContaining({
              message: "No chat model selected",
            }),
          }),
        }),
      },
    });
  });

  it("should handle compilation error - not enough context", async () => {
    const initialState = getRootStateWithClaude();
    initialState.session.history = [
      {
        message: { id: "1", role: "user", content: "Hello" },
        contextItems: [],
      },
    ];
    initialState.session.id = "session-123";
    const mockStore = createMockStore(initialState);
    const mockIdeMessenger = mockStore.mockIdeMessenger;
    const requestSpy = vi.spyOn(mockIdeMessenger, "request");
    const chatSpy = vi.spyOn(mockIdeMessenger, "llmStreamChat");

    requestSpy.mockImplementation(async (message, data) => {
      if (message === "llm/compileChat") {
        return {
          done: true,
          status: "error",
          error: "Not enough context available for this request",
        };
      } else {
        return await new MockIdeMessenger().request(message, data);
      }
    });

    // Execute thunk
    const result = await mockStore.dispatch(
      streamResponseThunk({
        editorState: mockEditorState,
        modifiers: mockModifiers,
      }) as any,
    );
    unwrapResult(result);

    // Verify thunk completed successfully (doesn't throw, handles error gracefully)
    expect(result.type).toBe("chat/streamResponse/fulfilled");

    // Verify key actions for out-of-context error path (flexible: runtime may dispatch additional actions)
    const dispatchedActions = mockStore.getActions();
    const actionTypes = dispatchedActions.map((a: any) => a.type);

    // Verify first and last actions
    expect(actionTypes[0]).toBe("chat/streamResponse/pending");
    expect(actionTypes[actionTypes.length - 1]).toBe(
      "chat/streamResponse/fulfilled",
    );

    // Verify the error handling flow
    expect(actionTypes).toContain("session/submitEditorAndInitAtIndex");
    expect(actionTypes).toContain("session/setActive");
    expect(actionTypes).toContain("session/setInactive");
    expect(actionTypes).toContain("session/saveCurrent/fulfilled");

    // Verify the out-of-context inline error was set
    const inlineErrorActions = dispatchedActions.filter(
      (a: any) => a.type === "session/setInlineErrorMessage",
    );
    const outOfContextError = inlineErrorActions.find(
      (a: any) => a.payload === "out-of-context",
    );
    expect(outOfContextError).toBeDefined();

    // Verify IDE messenger was called for compilation but not streaming
    expect(requestSpy).toHaveBeenCalledWith("llm/compileChat", {
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: [
            {
              text: "Hello",
              type: "text",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              text: "Hello, please help me with this code",
              type: "text",
            },
          ],
        },
      ],
      options: {},
    });
    expect(chatSpy).not.toHaveBeenCalled();

    // Verify final state shows error condition
    const finalState = mockStore.getState();
    expect(finalState).toEqual({
      ...initialState,
      session: {
        ...initialState.session,
        title: "Hello",
        history: [
          {
            contextItems: [],
            message: {
              content: "Hello",
              id: "1",
              role: "user",
            },
          },
          {
            appliedRules: [],
            contextItems: [],
            editorState: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Hello, please help me with this code",
                    },
                  ],
                },
              ],
            },
            message: {
              content: "Hello, please help me with this code",
              id: "mock-uuid-123",
              role: "user",
            },
          },
          {
            contextItems: [],
            isGatheringContext: false,
            message: {
              content: "",
              id: "mock-uuid-123",
              role: "assistant",
            },
          },
        ],
        streamAborter: expect.any(AbortController),
        inlineErrorMessage: "out-of-context", // Error message set
      },
    });
  });

  it("should throw error for other compilation errors", async () => {
    const initialState = getRootStateWithClaude();
    initialState.session.history = [
      {
        message: { id: "1", role: "user", content: "Hello" },
        contextItems: [],
      },
    ];
    const mockStore = createMockStore(initialState);
    const mockIdeMessenger = mockStore.mockIdeMessenger;
    const requestSpy = vi.spyOn(mockIdeMessenger, "request");
    const chatSpy = vi.spyOn(mockIdeMessenger, "llmStreamChat");

    // Mock compilation failure with generic error
    requestSpy.mockImplementation(async (message, data) => {
      if (message === "llm/compileChat") {
        return {
          done: true,
          status: "error",
          error: "Model configuration is invalid",
        };
      } else {
        return await mockIdeMessenger.request(message, data);
      }
    });

    // Execute thunk and expect it to be rejected
    const result = await mockStore.dispatch(
      streamResponseThunk({
        editorState: mockEditorState,
        modifiers: mockModifiers,
      }) as any,
    );

    // Verify thunk completed successfully but shows error dialog
    expect(result.type).toBe("chat/streamResponse/fulfilled");

    // Verify key actions for compilation error with dialog (flexible: runtime may dispatch additional actions)
    const dispatchedActions = mockStore.getActions();
    const actionTypes = dispatchedActions.map((a: any) => a.type);

    // Verify first and last actions
    expect(actionTypes[0]).toBe("chat/streamResponse/pending");
    expect(actionTypes[actionTypes.length - 1]).toBe(
      "chat/streamResponse/fulfilled",
    );

    // Verify error handling flow
    expect(actionTypes).toContain("chat/streamNormalInput/rejected");
    expect(actionTypes).toContain("chat/cancelStream/pending");
    expect(actionTypes).toContain("session/setInactive");
    expect(actionTypes).toContain("session/abortStream");
    expect(actionTypes).toContain("session/clearDanglingMessages");
    expect(actionTypes).toContain("chat/cancelStream/fulfilled");
    expect(actionTypes).toContain("ui/setDialogMessage");
    expect(actionTypes).toContain("ui/setShowDialog");

    // Verify the rejected action has the right error
    const rejectedAction = dispatchedActions.find(
      (a: any) => a.type === "chat/streamNormalInput/rejected",
    );
    expect(rejectedAction?.error?.message).toBe(
      "Model configuration is invalid",
    );

    // Verify the error dialog payload
    const dialogAction = dispatchedActions.find(
      (a: any) => a.type === "ui/setDialogMessage",
    );
    expect(dialogAction?.payload).toEqual(
      expect.objectContaining({
        props: expect.objectContaining({
          error: expect.objectContaining({
            message: "Model configuration is invalid",
          }),
        }),
      }),
    );

    // Verify IDE messenger was called for compilation but not streaming
    expect(requestSpy).toHaveBeenCalledWith("llm/compileChat", {
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Hello",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Hello, please help me with this code",
            },
          ],
        },
      ],
      options: {},
    });
    expect(chatSpy).not.toHaveBeenCalled();

    // Verify final state shows error dialog and inactive streaming
    const finalState = mockStore.getState();
    expect(finalState).toEqual({
      ...initialState,
      session: {
        ...initialState.session,
        streamAborter: expect.any(AbortController),
        mainEditorContentTrigger: mockEditorState, // Editor content that triggered the request
      },
      ui: {
        ...initialState.ui,
        showDialog: true, // Error dialog is shown
        dialogMessage: expect.objectContaining({
          props: expect.objectContaining({
            error: expect.objectContaining({
              message: "Model configuration is invalid",
            }),
          }),
        }),
      },
    });
  });
});
