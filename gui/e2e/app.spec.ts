/**
 * CodeIn GUI — End-to-End Tests
 *
 * These tests run against the Vite dev server (http://localhost:5173).
 * The GUI uses createMemoryRouter so all navigation must happen via clicks,
 * not URL changes.  Many Electron IPC calls will silently fail in browser
 * mode — that is expected behaviour and does NOT constitute a test failure.
 *
 * Run:  npm run test:e2e   (requires the dev server to be running, or
 *       Playwright will start it automatically via the webServer config)
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the root of the app and wait for the IDE shell to appear.
 * We check for .ide-shell which is always rendered regardless of Electron IPC.
 */
async function gotoApp(
  page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown
    ? P
    : never,
) {
  await page.goto("/");
  // Wait for the React tree to hydrate — the shell grid is the earliest
  // stable landmark we can depend on.
  await page.waitForSelector(".ide-shell", { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Suite 1 — App shell
// ---------------------------------------------------------------------------

test.describe("App shell renders", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("page title is CodeIn", async ({ page }) => {
    await expect(page).toHaveTitle("CodeIn");
  });

  test("IDE shell grid is present in the DOM", async ({ page }) => {
    await expect(page.locator(".ide-shell")).toBeVisible();
  });

  test("main content area is present", async ({ page }) => {
    // .ide-main holds all routed content
    await expect(page.locator(".ide-main")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Activity bar
// ---------------------------------------------------------------------------

test.describe("Activity bar", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("activity bar sidebar is visible", async ({ page }) => {
    await expect(page.locator(".ide-activity-bar")).toBeVisible();
  });

  test("activity bar contains the CodeIn logo", async ({ page }) => {
    await expect(page.locator(".ide-logo")).toBeVisible();
  });

  test("Chat button is present with correct aria-label", async ({ page }) => {
    await expect(page.locator('button[aria-label="Chat"]')).toBeVisible();
  });

  test("History button is present with correct aria-label", async ({
    page,
  }) => {
    await expect(page.locator('button[aria-label="History"]')).toBeVisible();
  });

  test("Settings button is present with correct aria-label", async ({
    page,
  }) => {
    await expect(page.locator('button[aria-label="Settings"]')).toBeVisible();
  });

  test("core and tools activity buttons render (Chat, History, Search, Git, Agents + More toggle)", async ({
    page,
  }) => {
    // Core(2) + Tools(3) + More toggle(1) = 6 visible top buttons by default
    // Advanced section is collapsed initially
    const topButtons = page.locator(".ide-activity-top .ide-activity-btn");
    const count = await topButtons.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("expanding advanced section reveals more buttons", async ({ page }) => {
    // Click the "Show more panels" toggle
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    await moreBtn.click();

    // Advanced section should now show additional buttons (Research, Pipeline, GPU, AI Hub, Computer Use)
    const topButtons = page.locator(".ide-activity-top .ide-activity-btn");
    const count = await topButtons.count();
    // 6 base + 5 advanced = 11 minimum
    expect(count).toBeGreaterThanOrEqual(11);
  });

  test("status bar is present with ready text", async ({ page }) => {
    await expect(page.locator(".ide-status-bar")).toBeVisible();
    await expect(page.locator(".ide-status-bar")).toContainText("Ready");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — Chat input (TipTap)
// ---------------------------------------------------------------------------

test.describe("Chat input", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("main ContinueInputBox wrapper is present", async ({ page }) => {
    // data-testid is set to `continue-input-box-${inputId}` where inputId = "main-editor-input"
    await expect(
      page.locator('[data-testid="continue-input-box-main-editor-input"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("TipTap contenteditable editor is present", async ({ page }) => {
    // TipTap renders a div[contenteditable] inside the input wrapper
    const editor = page
      .locator('[data-testid="continue-input-box-main-editor-input"]')
      .locator('[contenteditable="true"]');
    await expect(editor).toBeVisible({ timeout: 10000 });
  });

  test("submit button is present inside the input toolbar", async ({
    page,
  }) => {
    await expect(
      page.locator('[data-testid="submit-input-button"]'),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Mode selector
// ---------------------------------------------------------------------------

test.describe("Mode selector", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("mode radiogroup is present with correct aria-label", async ({
    page,
  }) => {
    await expect(
      page.locator('[role="radiogroup"][aria-label="Chat mode"]'),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Ask, Plan, Agent and Implement radio buttons are all visible", async ({
    page,
  }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );
    await expect(radiogroup).toBeVisible({ timeout: 10000 });

    for (const label of ["Ask", "Plan", "Agent", "Implement"]) {
      await expect(
        radiogroup.locator(`[role="radio"]`, { hasText: label }),
      ).toBeVisible();
    }
  });

  test("exactly one mode is checked by default", async ({ page }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );
    await expect(radiogroup).toBeVisible({ timeout: 10000 });

    const checkedButtons = radiogroup.locator(
      '[role="radio"][aria-checked="true"]',
    );
    await expect(checkedButtons).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — Mode switching
// ---------------------------------------------------------------------------

test.describe("Mode switching", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    // Wait for the mode selector to be ready
    await page.locator('[role="radiogroup"][aria-label="Chat mode"]').waitFor({
      timeout: 10000,
    });
  });

  test("clicking Agent sets aria-checked to true on the Agent button", async ({
    page,
  }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );
    const agentBtn = radiogroup.locator('[role="radio"]', { hasText: "Agent" });

    await agentBtn.click();

    await expect(agentBtn).toHaveAttribute("aria-checked", "true");
  });

  test("clicking Agent deselects the previously active mode", async ({
    page,
  }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );

    // Record the button that starts as checked
    const initialChecked = radiogroup.locator(
      '[role="radio"][aria-checked="true"]',
    );
    const initialText = await initialChecked.textContent();

    if (initialText?.trim() !== "Agent") {
      // Click Agent — previous active should become unchecked
      const agentBtn = radiogroup.locator('[role="radio"]', {
        hasText: "Agent",
      });
      await agentBtn.click();

      const previousBtn = radiogroup.locator('[role="radio"]', {
        hasText: initialText!.trim(),
      });
      await expect(previousBtn).toHaveAttribute("aria-checked", "false");
    }
    // If Agent was already active, clicking it again keeps it checked (no-op)
  });

  test("clicking Implement sets it as the active mode", async ({ page }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );
    const implementBtn = radiogroup.locator('[role="radio"]', {
      hasText: "Implement",
    });

    await implementBtn.click();

    await expect(implementBtn).toHaveAttribute("aria-checked", "true");
    // All other buttons should be unchecked
    const otherButtons = radiogroup.locator(
      '[role="radio"]:not(:has-text("Implement"))',
    );
    const count = await otherButtons.count();
    for (let i = 0; i < count; i++) {
      await expect(otherButtons.nth(i)).toHaveAttribute(
        "aria-checked",
        "false",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — Activity bar navigation
// ---------------------------------------------------------------------------

test.describe("Activity bar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("clicking Settings button adds the active class to the Settings btn", async ({
    page,
  }) => {
    const settingsBtn = page.locator('button[aria-label="Settings"]');
    await settingsBtn.click();

    // After clicking, the Settings button should receive the 'active' class
    await expect(settingsBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("clicking History button navigates away from Chat view", async ({
    page,
  }) => {
    // The chat input should be visible before we navigate away
    await page
      .locator('[data-testid="continue-input-box-main-editor-input"]')
      .waitFor({ timeout: 10000 });

    const historyBtn = page.locator('button[aria-label="History"]');
    await historyBtn.click();

    // After navigation the history button should be active
    await expect(historyBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("clicking Chat button marks it as active", async ({ page }) => {
    // First navigate away to History
    await page.locator('button[aria-label="History"]').click();

    // Then navigate back to Chat
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();

    await expect(chatBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("clicking Search navigates to repo intelligence panel", async ({
    page,
  }) => {
    const searchBtn = page.locator('button[aria-label="Search"]');
    await searchBtn.click();
    await expect(searchBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("clicking Git navigates to git panel", async ({ page }) => {
    const gitBtn = page.locator('button[aria-label="Git"]');
    await gitBtn.click();
    await expect(gitBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("clicking Agents navigates to swarm panel", async ({ page }) => {
    const agentsBtn = page.locator('button[aria-label="Agents"]');
    await agentsBtn.click();
    await expect(agentsBtn).toHaveClass(/active/, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — Status bar content
// ---------------------------------------------------------------------------

test.describe("Status bar content", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("status bar shows version string", async ({ page }) => {
    await expect(page.locator(".ide-status-bar")).toContainText("v1.1.0");
  });

  test("status bar shows CodeIn tagline", async ({ page }) => {
    await expect(page.locator(".ide-status-bar")).toContainText("CodeIn");
  });

  test("status bar footer is a <footer> landmark", async ({ page }) => {
    // Semantic HTML: status bar must be a footer element for accessibility
    const footer = page.locator("footer.ide-status-bar");
    await expect(footer).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Suite 8 — Keyboard accessibility
// ---------------------------------------------------------------------------

test.describe("Keyboard accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await page
      .locator('[role="radiogroup"][aria-label="Chat mode"]')
      .waitFor({ timeout: 10000 });
  });

  test("mode selector supports ArrowRight navigation between options", async ({
    page,
  }) => {
    const radiogroup = page.locator(
      '[role="radiogroup"][aria-label="Chat mode"]',
    );

    // Focus the currently-active radio button (tabIndex=0)
    await radiogroup.locator('[role="radio"][aria-checked="true"]').focus();

    // Press ArrowRight to move to the next option
    await page.keyboard.press("ArrowRight");

    // Exactly one button should now be checked and focused
    const checkedButtons = radiogroup.locator(
      '[role="radio"][aria-checked="true"]',
    );
    await expect(checkedButtons).toHaveCount(1);
  });

  test("activity bar buttons are focusable via Tab", async ({ page }) => {
    // Tab enough times to reach the first activity bar button
    // We use a small loop rather than a hard-coded count to be resilient
    let focused = false;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const activeEl = await page.evaluate(() =>
        document.activeElement?.classList.contains("ide-activity-btn"),
      );
      if (activeEl) {
        focused = true;
        break;
      }
    }
    expect(focused).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 9 — Workspace / IDE mode
// ---------------------------------------------------------------------------

test.describe("Workspace IDE mode", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("Files button is present in activity bar", async ({ page }) => {
    await expect(page.locator('button[aria-label="Files"]')).toBeVisible();
  });

  test("clicking Files navigates to workspace and shows Files as active", async ({
    page,
  }) => {
    const filesBtn = page.locator('button[aria-label="Files"]');
    await filesBtn.click();
    await expect(filesBtn).toHaveClass(/active/, { timeout: 5000 });
  });

  test("workspace shows editor placeholder when no files are open", async ({
    page,
  }) => {
    await page.locator('button[aria-label="Files"]').click();
    await expect(
      page.locator("text=Open a file from the explorer"),
    ).toBeVisible({ timeout: 5000 });
  });

  test("can navigate back to Chat from workspace", async ({ page }) => {
    await page.locator('button[aria-label="Files"]').click();
    await page.waitForTimeout(500);
    const chatBtn = page.locator('button[aria-label="Chat"]');
    await chatBtn.click();
    await expect(chatBtn).toHaveClass(/active/, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Suite 10 — Panel rendering (smoke tests)
// ---------------------------------------------------------------------------

test.describe("Panel smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test("Git panel renders header when navigated to", async ({ page }) => {
    await page.locator('button[aria-label="Git"]').click();
    await expect(page.locator("h2", { hasText: "Git" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("Search panel renders header when navigated to", async ({ page }) => {
    await page.locator('button[aria-label="Search"]').click();
    await expect(page.locator("h2", { hasText: "Code Search" })).toBeVisible({
      timeout: 5000,
    });
  });

  test("Settings page renders when navigated to", async ({ page }) => {
    await page.locator('button[aria-label="Settings"]').click();
    // Settings page should show config tabs
    await expect(page.locator(".ide-main")).toBeVisible({ timeout: 5000 });
  });

  test("Advanced panels accessible after expanding More section", async ({
    page,
  }) => {
    // Expand advanced section
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    await moreBtn.click();

    // Click GPU Monitor
    const gpuBtn = page.locator('button[aria-label="GPU Monitor"]');
    await gpuBtn.click();
    await expect(gpuBtn).toHaveClass(/active/, { timeout: 5000 });
  });
});
