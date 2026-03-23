/**
 * CodeIn GUI — Screenshot capture for UX audit
 * Takes screenshots of all major screens and panels for review.
 */

import { expect, test } from "@playwright/test";

async function gotoApp(page: any) {
  await page.goto("/");
  await page.waitForSelector(".ide-shell", { timeout: 15000 });
}

test.describe("UX Audit Screenshots", () => {
  test("01 - Main chat view (landing state)", async ({ page }) => {
    await gotoApp(page);
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/01-main-chat.png",
      fullPage: true,
    });
  });

  test("02 - Activity bar with all sections expanded", async ({ page }) => {
    await gotoApp(page);
    // Expand advanced section
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({
      path: "test-results/screenshots/02-activity-bar-expanded.png",
      fullPage: true,
    });
  });

  test("03 - Settings / Config page", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="Settings"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/03-settings.png",
      fullPage: true,
    });
  });

  test("04 - Git panel", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="Git"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/04-git-panel.png",
      fullPage: true,
    });
  });

  test("05 - Search / Code Search panel", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="Search"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/05-search-panel.png",
      fullPage: true,
    });
  });

  test("06 - Agents / Swarm panel", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="Agents"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/06-agents-panel.png",
      fullPage: true,
    });
  });

  test("07 - History view", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="History"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/07-history.png",
      fullPage: true,
    });
  });

  test("08 - Advanced panels - GPU Monitor", async ({ page }) => {
    await gotoApp(page);
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    if (await moreBtn.isVisible()) await moreBtn.click();
    await page.waitForTimeout(300);
    await page.locator('button[aria-label="GPU Monitor"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/08-gpu-monitor.png",
      fullPage: true,
    });
  });

  test("09 - Advanced panels - Research", async ({ page }) => {
    await gotoApp(page);
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    if (await moreBtn.isVisible()) await moreBtn.click();
    await page.waitForTimeout(300);
    await page.locator('button[aria-label="Research"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/09-research.png",
      fullPage: true,
    });
  });

  test("10 - Advanced panels - Pipeline", async ({ page }) => {
    await gotoApp(page);
    const moreBtn = page.locator('button[aria-label="Show more panels"]');
    if (await moreBtn.isVisible()) await moreBtn.click();
    await page.waitForTimeout(300);
    await page.locator('button[aria-label="Pipeline"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/10-pipeline.png",
      fullPage: true,
    });
  });

  test("11 - Workspace / IDE mode", async ({ page }) => {
    await gotoApp(page);
    await page.locator('button[aria-label="Files"]').click();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "test-results/screenshots/11-workspace.png",
      fullPage: true,
    });
  });

  test("12 - Mode selector states", async ({ page }) => {
    await gotoApp(page);
    await page
      .locator('[role="radiogroup"][aria-label="Chat mode"]')
      .waitFor({ timeout: 10000 });

    // Click through each mode and capture
    for (const mode of ["Ask", "Plan", "Agent", "Implement"]) {
      const radio = page
        .locator('[role="radiogroup"][aria-label="Chat mode"]')
        .locator(`[role="radio"]`, { hasText: mode });
      await radio.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: "test-results/screenshots/11-mode-selector.png",
      fullPage: true,
    });
  });
});
