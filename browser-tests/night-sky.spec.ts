import { expect, test } from "@playwright/test";

test("clear night sea renders the star field without WebGL errors", async ({ page }) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/?weather=clear&time=night");
  const ocean = page.locator("#ocean");
  await expect(ocean).toHaveAttribute("data-waterway", "sea");
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#ocean")?.dataset.ready === "true");

  const canvas = page.locator("#ocean canvas");
  await expect(canvas).toBeVisible();
  const surface = await canvas.evaluate(element => {
    const target = element as HTMLCanvasElement;
    return {
      width: target.width,
      height: target.height,
      hasWebGL: Boolean(target.getContext("webgl2") || target.getContext("webgl")),
    };
  });
  expect(surface.width).toBeGreaterThan(0);
  expect(surface.height).toBeGreaterThan(0);
  expect(surface.hasWebGL).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
