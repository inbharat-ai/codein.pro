import { act, screen, waitFor } from "@testing-library/react";
import { addAndSelectMockLlm } from "../../../util/test/config";
import { renderWithProviders } from "../../../util/test/render";
import {
  getElementByTestId,
  sendInputWithMockedResponse,
} from "../../../util/test/utils";
import { Chat } from "../Chat";

test("should render input box", { timeout: 15_000 }, async () => {
  await renderWithProviders(<Chat />);
  await getElementByTestId("continue-input-box-main-editor-input");
});

test("should be able to toggle modes", async () => {
  await renderWithProviders(<Chat />);

  // Initial mode is "ask" — verify the Ask radio is checked
  const askRadio = screen.getByRole("radio", { name: "Ask" });
  expect(askRadio).toHaveAttribute("aria-checked", "true");

  // Click "Plan" to switch mode
  await act(async () => {
    screen.getByRole("radio", { name: "Plan" }).click();
  });
  expect(screen.getByRole("radio", { name: "Plan" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Click "Agent"
  await act(async () => {
    screen.getByRole("radio", { name: "Agent" }).click();
  });
  expect(screen.getByRole("radio", { name: "Agent" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Click "Implement"
  await act(async () => {
    screen.getByRole("radio", { name: "Implement" }).click();
  });
  expect(screen.getByRole("radio", { name: "Implement" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Click back to "Ask"
  await act(async () => {
    screen.getByRole("radio", { name: "Ask" }).click();
  });
  expect(screen.getByRole("radio", { name: "Ask" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test(
  "should send a message and receive a response",
  { timeout: 15_000 },
  async () => {
    const { ideMessenger, store } = await renderWithProviders(<Chat />);

    // First add and select the mock LLM
    await act(async () => {
      addAndSelectMockLlm(store, ideMessenger);
    });

    const CONTENT = "Expected response";
    const INPUT = "User input";

    await sendInputWithMockedResponse(ideMessenger, INPUT, [
      { role: "assistant", content: CONTENT },
    ]);

    // Wait for streaming to complete and content to render
    await waitFor(
      () => {
        // The content may be split across DOM nodes by the markdown renderer,
        // so use a substring matcher instead of exact text match.
        const elements = screen.getAllByText((content) =>
          content.includes(CONTENT),
        );
        expect(elements.length).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );
  },
);
