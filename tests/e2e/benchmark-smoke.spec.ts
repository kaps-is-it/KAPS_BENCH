import { expect, test } from "@playwright/test";

test("homepage exposes cpu and gpu launch cards", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Test Your Laptop/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start CPU Benchmark/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start GPU Benchmark/i })).toBeVisible();
});

test("cpu smoke benchmark flow persists a result in dev mode", async ({ page }) => {
  await page.goto("/benchmark/cpu?preset=smoke&mockCpu=1");

  const startButton = page
    .locator("section")
    .filter({ hasText: "CPU Performance Benchmark" })
    .getByRole("button", { name: /^Start Full CPU Benchmark$/i })
    .first();
  await expect(startButton).toBeVisible({ timeout: 20_000 });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await page.waitForURL(/\/results\//, { timeout: 60_000 });
  await expect(page.getByText("Subscore breakdown")).toBeVisible();
});

test("cpu single-core smoke flow persists a partial result in dev mode", async ({ page }) => {
  await page.goto("/benchmark/cpu?preset=smoke&mockCpu=1");

  const startButton = page
    .locator("section")
    .filter({ hasText: "CPU Performance Benchmark" })
    .getByRole("button", { name: /^Single-Core Benchmark$/i })
    .first();
  await expect(startButton).toBeVisible({ timeout: 20_000 });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await page.waitForURL(/\/results\//, { timeout: 60_000 });
  await expect(page.getByText("Single-Core CPU Benchmark", { exact: true })).toBeVisible();
});

test("gpu smoke mock flow persists a result in dev mode", async ({ page }) => {
  await page.goto("/benchmark/gpu?preset=smoke&mockGpu=1");

  const startButton = page
    .locator("section")
    .filter({ hasText: "GPU Performance Benchmark" })
    .getByRole("button", { name: /^Start GPU Benchmark$/i })
    .first();
  await expect(startButton).toBeVisible({ timeout: 20_000 });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await page.waitForURL(/\/results\//, { timeout: 60_000 });
  await expect(page.getByText("Subscore breakdown", { exact: true })).toBeVisible();
});
