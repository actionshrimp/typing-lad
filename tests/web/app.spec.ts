import { test, expect } from "@playwright/test";

test.describe("Web App", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("renders menu on load", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Start a 20-word/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /View Stats/ })).toBeVisible();
    await expect(page.getByText("Welcome back to")).toBeVisible();
  });

  test("starts practice mode and shows a word", async ({ page }) => {
    await page.goto("/");
    // Click the Practice button (bento card)
    await page.getByRole("button", { name: /Practice/ }).first().click();
    await expect(page.getByText("Session Progress")).toBeVisible();
    await expect(page.getByText("Target")).toBeVisible();
    await expect(page.getByText("0/20")).toBeVisible();
  });

  test("types correct characters and shows green feedback", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Practice/ }).first().click();
    await expect(page.getByText("Target")).toBeVisible();

    // Get all untyped chars to form the target word
    const chars = await page.locator(".char-cursor, .char-untyped").allTextContents();
    const word = chars.join("");
    if (word.length > 1) {
      // Type just the first char — should show green and still be on same word
      await page.keyboard.press(word[0]);
      await expect(page.locator(".char-correct")).toBeVisible();
    } else {
      // Single-char word completes immediately — verify it advanced
      await page.keyboard.press(word[0]);
      await expect(page.getByText("1/20")).toBeVisible();
    }
  });

  test("incorrect keystroke shows error and resets", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Practice/ }).first().click();
    await expect(page.getByText("Target")).toBeVisible();

    // Type wrong character
    await page.keyboard.press("~");
    // Should still show 0/20
    await expect(page.getByText("0/20")).toBeVisible();
  });

  test("escape returns to home from practice", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Practice/ }).first().click();
    await expect(page.getByText("Session Progress")).toBeVisible();
    await page.keyboard.press("Escape");
    // Should go back to home
    await expect(page.getByText("Welcome back to")).toBeVisible();
  });

  test("navigates to stats view", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /View Stats/ }).click();
    await expect(page.getByText("Personal Progress")).toBeVisible();
    await expect(page.getByText("Total Words")).toBeVisible();
  });

  test("full session completes and shows summary", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Practice/ }).first().click();

    for (let w = 0; w < 20; w++) {
      await expect(page.getByText("Target")).toBeVisible();

      // Get the active word (chars with cursor/untyped classes)
      const activeWordEl = page.locator(".char-cursor, .char-untyped").first().locator("..");
      const target = await activeWordEl.textContent();
      if (!target) break;

      // Type only the actual word (strip any non-letter chars)
      const word = target.replace(/[^a-z]/g, "");
      for (const ch of word) {
        await page.keyboard.press(ch);
      }

      if (w < 19) {
        await expect(page.getByText(`${w + 1}/20`)).toBeVisible();
      }
    }

    await expect(page.getByText("Session Complete")).toBeVisible({ timeout: 5000 });
  });

  test("keyboard-only navigation works", async ({ page }) => {
    await page.goto("/");
    // Press Enter to start practice (Menu handles Enter)
    await page.keyboard.press("Enter");
    await expect(page.getByText("Session Progress")).toBeVisible();
    await page.keyboard.press("Escape");
    // Back at home
    await expect(page.getByText("Welcome back to")).toBeVisible();
  });

  test("sidebar mode switching works", async ({ page }) => {
    await page.goto("/");
    // Click Paragraph Mode in sidebar
    await page.getByRole("button", { name: /Paragraph Mode/ }).click();
    // Should show paragraph typing zone
    await expect(page.locator(".char-cursor, .char-untyped").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Welcome back to")).toBeVisible();

    // Click Word Mode in sidebar
    await page.getByRole("button", { name: /Word Mode/ }).click();
    await expect(page.getByText("Session Progress")).toBeVisible();
  });
});
