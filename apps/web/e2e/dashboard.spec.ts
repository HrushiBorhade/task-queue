import { test, expect } from "@playwright/test";
import { TEST_USER } from "./fixtures";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("/");
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("renders header with user email and sign out", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Task Queue" })).toBeVisible();
    await expect(page.getByText(TEST_USER.email)).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("renders seeded tasks in grid", async ({ page }) => {
    await expect(page.getByText("research agent")).toBeVisible();
    await expect(page.getByText("webhook processing")).toBeVisible();
    await expect(page.getByText("image gen")).toBeVisible();
    await expect(page.getByText("email campaign")).toBeVisible();
    await expect(page.getByText("text gen")).toBeVisible();
    await expect(page.getByText("pdf report")).toBeVisible();
  });

  test("task cards show status badges", async ({ page }) => {
    await expect(page.getByText("queued")).toBeVisible();
    await expect(page.getByText("active").first()).toBeVisible();
    await expect(page.getByText("completed").first()).toBeVisible();
    await expect(page.getByText("failed")).toBeVisible();
  });

  test("task cards show progress", async ({ page }) => {
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText("72%", { exact: true })).toBeVisible();
    await expect(page.getByText("100%", { exact: true }).first()).toBeVisible();
  });

  test("tabs switch between tasks and batches", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("tab", { name: "Batches" }).click();
    await expect(page.getByText("No batches yet")).toBeVisible();

    await page.getByRole("tab", { name: "Tasks" }).click();
    await expect(page.getByText("research agent")).toBeVisible();
  });

  test("create task dialog opens and has form fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create Task" }).click();

    await expect(page.getByRole("heading", { name: "Create Task" })).toBeVisible();
    await expect(page.getByText("Task Type")).toBeVisible();
    await expect(page.getByText("Prompt")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
  });

  test("create task dialog closes on close button", async ({ page }) => {
    await page.getByRole("button", { name: "Create Task" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("sign out redirects to login", async ({ page }) => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("/login");
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  });

  test("unauthenticated user redirected to login", async ({ page }) => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/login/);

    await page.goto("/");
    await page.waitForURL(/\/login/);
  });
});
