import { test, expect } from "@playwright/test";
import { TEST_USER } from "./fixtures";

test.describe("Auth Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("login page renders correctly", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  });

  test("continue button enables when email entered", async ({ page }) => {
    await page.getByLabel("Email").fill(TEST_USER.email);
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("existing user sees password step", async ({ page }) => {
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByRole("button", { name: "Continue" }).click();

    // Wait for AnimatePresence exit/enter transition
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeDisabled();
  });

  test("back button returns to email step", async ({ page }) => {
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Go back" }).click();

    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible({ timeout: 10000 });
  });

  test("new user sees create password step", async ({ page }) => {
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
  });

  test("successful login redirects to dashboard", async ({ page }) => {
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Login" }).click();

    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Task Queue" })).toBeVisible();
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible();
  });

  test("tech stack badges visible on right panel", async ({ page }) => {
    await expect(page.getByText("BullMQ")).toBeVisible();
    await expect(page.getByText("Prometheus")).toBeVisible();
    await expect(page.getByText("Slack Alerts")).toBeVisible();
    await expect(page.getByText("Sentry")).toBeVisible();
  });
});
