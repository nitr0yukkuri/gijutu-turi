import { expect, test } from "@playwright/test";

const routes = ["/", "/gofish", "/dockerwhale", "/cssfish", "/k8sfish", "/rustfish", "/jseel"];

for (const route of routes) {
  test(`${route} renders its WebGL scene without browser errors`, async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const modelChunkName = route === "/dockerwhale" ? "docker-whale" : "go-fish";
    const loadedModelChunks = new Set<string>();
    page.on("response", response => {
      const path = new URL(response.url()).pathname;
      if (path.includes("/chunks/go-fish-")) loadedModelChunks.add("go-fish");
      if (path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")) loadedModelChunks.add("docker-whale");
    });
    const modelChunkResponse = page.waitForResponse(response => {
      if (response.request().resourceType() !== "script") return false;
      const path = new URL(response.url()).pathname;
      return modelChunkName === "docker-whale"
        ? path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")
        : path.includes("/chunks/go-fish-");
    });
    await page.goto(route);
    expect((await modelChunkResponse).ok()).toBe(true);
    await page.locator("#ocean").waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#ocean")?.dataset.ready === "true");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect([...loadedModelChunks]).toEqual([modelChunkName]);
    const canvas = page.locator("#ocean canvas");
    await expect(canvas).toBeVisible();
    const surface = await canvas.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      return {
        width: canvas.width,
        height: canvas.height,
        hasWebGL: Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")),
      };
    });
    expect(surface.width).toBeGreaterThan(0);
    expect(surface.height).toBeGreaterThan(0);
    expect(surface.hasWebGL).toBe(true);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

test("the fishing scene stays within common desktop and phone viewports", async ({ page }) => {
  await page.goto("/gofish");
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#ocean")?.dataset.ready === "true");

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      canvas: document.querySelector<HTMLCanvasElement>("#ocean canvas")?.width ?? 0,
      canvasRight: document.querySelector<HTMLCanvasElement>("#ocean canvas")?.getBoundingClientRect().right ?? 0,
    }));
    expect(dimensions.document, `${viewport.width}x${viewport.height} document width`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body, `${viewport.width}x${viewport.height} body width`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.canvasRight, `${viewport.width}x${viewport.height} canvas right edge`).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.canvas).toBeGreaterThan(0);
  }
});
