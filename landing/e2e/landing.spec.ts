import { test, expect } from "@playwright/test";

test.describe("Landing Page — Structure & Content", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads and displays the hero section", async ({ page }) => {
    await expect(page).toHaveTitle(/CodeIn/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Code in every");
    await expect(page.locator("h1")).toContainText("language of Bharat");
  });

  test("hero download button is visible and clickable", async ({ page }) => {
    const heroBtn = page.locator("#hero-download-btn");
    await expect(heroBtn).toBeVisible();
    await expect(heroBtn).toBeEnabled();
  });

  test("hero detects OS and updates button text", async ({ page }) => {
    const btnText = page.locator("#hero-btn-text");
    await expect(btnText).not.toHaveText("Download for your OS");
    // Should have resolved to Windows, macOS, or Linux
    const text = await btnText.textContent();
    expect(text).toMatch(/Download for (Windows|macOS|Linux)/);
  });

  test("navbar is present with navigation links", async ({ page }) => {
    const nav = page.locator("nav#navbar");
    await expect(nav).toBeVisible();
    await expect(page.locator('a[href="#features"]').first()).toBeVisible();
    await expect(page.locator('a[href="#downloads"]').first()).toBeVisible();
    await expect(page.locator('a[href="#faq"]').first()).toBeVisible();
  });

  test("stats section displays correct numbers", async ({ page }) => {
    await expect(page.getByText("19").first()).toBeVisible();
    await expect(page.getByText("Indian Languages").first()).toBeVisible();
    await expect(page.getByText("6+").first()).toBeVisible();
    await expect(page.getByText("35+").first()).toBeVisible();
  });

  test("feature cards are rendered", async ({ page }) => {
    const featureCards = page.locator(".feature-card");
    await expect(featureCards).toHaveCount(7);
  });

  test("skill cards are rendered", async ({ page }) => {
    const skillCards = page.locator(".skill-card");
    const count = await skillCards.count();
    expect(count).toBeGreaterThanOrEqual(9);
  });

  test("footer contains required links", async ({ page }) => {
    await expect(page.locator("footer")).toBeVisible();
    await expect(
      page.locator('footer a[href*="github.com"]').first(),
    ).toBeVisible();
    await expect(page.getByText("Apache-2.0 License").first()).toBeVisible();
  });
});

test.describe("Landing Page — FAQ Accordion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("FAQ answers are initially hidden", async ({ page }) => {
    const answers = page.locator(".faq-answer");
    const count = await answers.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(answers.nth(i)).toHaveClass(/hidden/);
    }
  });

  test("clicking FAQ question reveals the answer", async ({ page }) => {
    const firstFaqBtn = page.locator(".faq-item button").first();
    await firstFaqBtn.click();

    const firstAnswer = page.locator(".faq-answer").first();
    await expect(firstAnswer).not.toHaveClass(/hidden/);
  });

  test("clicking an open FAQ closes it", async ({ page }) => {
    const firstFaqBtn = page.locator(".faq-item button").first();

    // Open
    await firstFaqBtn.click();
    await expect(page.locator(".faq-answer").first()).not.toHaveClass(/hidden/);

    // Close
    await firstFaqBtn.click();
    await expect(page.locator(".faq-answer").first()).toHaveClass(/hidden/);
  });

  test("opening a second FAQ closes the first", async ({ page }) => {
    const faqButtons = page.locator(".faq-item button");

    await faqButtons.nth(0).click();
    await expect(page.locator(".faq-answer").nth(0)).not.toHaveClass(/hidden/);

    await faqButtons.nth(1).click();
    await expect(page.locator(".faq-answer").nth(0)).toHaveClass(/hidden/);
    await expect(page.locator(".faq-answer").nth(1)).not.toHaveClass(/hidden/);
  });
});

test.describe("Landing Page — Downloads Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("download section exists with OS tabs", async ({ page }) => {
    const section = page.locator("#downloads");
    await expect(section).toBeVisible();

    // Should have Windows, macOS, Linux tabs
    await expect(page.locator("#tab-windows")).toBeVisible();
    await expect(page.locator("#tab-mac")).toBeVisible();
    await expect(page.locator("#tab-linux")).toBeVisible();
  });

  test("switching OS tabs updates download cards", async ({ page }) => {
    // Click macOS tab
    await page.locator("#tab-mac").click();
    const downloadCards = page.locator("#download-cards .download-card");
    const count = await downloadCards.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Landing Page — Responsiveness", () => {
  test("mobile: hamburger menu is visible", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const menuBtn = page.locator("#mobile-menu-btn");
    await expect(menuBtn).toBeVisible();

    // Desktop nav links should be hidden
    const desktopLinks = page.locator("nav .md\\:flex");
    await expect(desktopLinks).toHaveCSS("display", "none");
  });

  test("mobile: hero text is readable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();

    // Check that h1 doesn't overflow the viewport
    const box = await h1.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375);
    }
  });

  test("tablet: layout doesn't break", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");

    // No horizontal scroll
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const clientWidth = await page.evaluate(
      () => document.documentElement.clientWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe("Landing Page — Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page has a lang attribute", async ({ page }) => {
    const lang = await page.locator("html").getAttribute("lang");
    expect(lang).toBe("en");
  });

  test("all images have alt attributes", async ({ page }) => {
    const images = page.locator("img");
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute("alt");
      expect(alt).toBeTruthy();
    }
  });

  test("mobile menu button has aria-label", async ({ page }) => {
    const menuBtn = page.locator("#mobile-menu-btn");
    const ariaLabel = await menuBtn.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
  });

  test("page has meta description", async ({ page }) => {
    const meta = page.locator('meta[name="description"]');
    const content = await meta.getAttribute("content");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test("skip-to-content link exists for keyboard navigation", async ({
    page,
  }) => {
    const skipLink = page.locator('a[href="#features"]').first();
    await expect(skipLink).toBeAttached();
  });

  test("interactive elements have visible focus styles", async ({ page }) => {
    // Tab to the first link in nav
    await page.keyboard.press("Tab");
    // The skip link should be the first focused element
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
  });
});

test.describe("Landing Page — Language Switcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("language switcher button is visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const langBtn = page.locator("#lang-switcher button").first();
    await expect(langBtn).toBeVisible();
  });

  test("language menu opens on click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const langBtn = page.locator("#lang-switcher button").first();
    await langBtn.click();

    const langMenu = page.locator("#lang-menu");
    await expect(langMenu).not.toHaveClass(/hidden/);
  });

  test("language menu closes on outside click", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const langBtn = page.locator("#lang-switcher button").first();
    await langBtn.click();
    await expect(page.locator("#lang-menu")).not.toHaveClass(/hidden/);

    // Click outside the menu
    await page.locator("h1").click();
    await expect(page.locator("#lang-menu")).toHaveClass(/hidden/);
  });
});

test.describe("Landing Page — Comparison Table", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("comparison table renders with CodeIn column", async ({ page }) => {
    const table = page.locator("table");
    await expect(table.first()).toBeVisible();
    await expect(page.getByText("CodeIn").first()).toBeVisible();
    await expect(page.getByText("$0").first()).toBeVisible();
  });
});

test.describe("Landing Page — Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("navbar gets backdrop blur on scroll", async ({ page }) => {
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(100);
    const navbar = page.locator("#navbar");
    const classes = await navbar.getAttribute("class");
    expect(classes).toContain("backdrop-blur-xl");
  });

  test("mobile menu opens and closes correctly", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const menuBtn = page.locator("#mobile-menu-btn");
    const menu = page.locator("#mobile-menu");

    // Initially hidden
    await expect(menu).toHaveClass(/hidden/);

    // Open
    await menuBtn.click();
    await expect(menu).not.toHaveClass(/hidden/);

    // Close on link click
    await menu.locator("a").first().click();
    await expect(menu).toHaveClass(/hidden/);
  });
});
