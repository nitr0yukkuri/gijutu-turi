import { expect, test } from "@playwright/test";

const routes = ["/", "/gofish", "/dockerwhale", "/cssfish", "/k8sfish", "/rustfish", "/jseel"];

for (const route of routes) {
  test(`${route} renders its WebGL scene without browser errors`, async ({ page }) => {
    if (route === "/") {
      // Prepare a deterministic Docker room, then return it to the default
      // route without pinning a client fish. This exercises the unqualified
      // root before the server's authoritative species snapshot arrives.
      const baseURL = test.info().project.use.baseURL;
      if (typeof baseURL !== "string") throw new Error("Playwright baseURL is required for the root route test");
      const sessionResponse = await page.request.post(new URL("/api/ocean-sessions", baseURL).toString(), {
        data: { playerId: "player_browser-test-root", fishId: "whale-001" },
      });
      expect(sessionResponse.status()).toBe(201);
      const session = await sessionResponse.json() as { id: string; host?: string };
      await page.route("**/api/ocean-sessions", async route => {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        expect(payload.fishId).toBeUndefined();
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(session) });
      });
    }

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const expectedModelChunks = route === "/" || route === "/dockerwhale"
      ? ["docker-whale"]
      : ["go-fish"];
    const loadedModelChunks = new Set<string>();
    page.on("response", response => {
      if (response.request().resourceType() !== "script") return;
      const path = new URL(response.url()).pathname;
      if (path.includes("/chunks/go-fish-")) loadedModelChunks.add("go-fish");
      if (path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")) loadedModelChunks.add("docker-whale");
    });
    const modelChunkResponse = page.waitForResponse(response => {
      if (response.request().resourceType() !== "script") return false;
      const path = new URL(response.url()).pathname;
      return expectedModelChunks.some(chunkName => chunkName === "docker-whale"
        ? path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")
        : path.includes("/chunks/go-fish-"));
    });
    await page.goto(route);
    expect((await modelChunkResponse).ok()).toBe(true);
    await page.locator("#ocean").waitFor();
    await page.waitForFunction(() => document.querySelector<HTMLElement>("#ocean")?.dataset.ready === "true");
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect([...loadedModelChunks]).toHaveLength(1);
    expect(expectedModelChunks).toContain([...loadedModelChunks][0]);
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

test("/complete shows every fish as a read-only showcase without opening game APIs", async ({ page }) => {
  // This route mounts each high-detail fish preview in turn; software WebGL
  // needs more than the default timeout to compile all six species shaders.
  test.setTimeout(90_000);
  const apiRequests: string[] = [];
  const sockets: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${url.pathname}`);
  });
  page.on("websocket", socket => sockets.push(socket.url()));

  await page.goto("/complete");
  await expect(page.getByRole("heading", { name: "魚図鑑コンプリート" })).toBeVisible();
  await expect(page.getByText(/展示用サンプル/)).toBeVisible();
  await expect(page.getByLabel(/発見済み 6 \/ 6 種/)).toBeVisible();

  const fishCards = page.locator(".complete-fish-card");
  await expect(page.getByRole("heading", { name: "魚図鑑", exact: true })).toBeVisible();
  await expect(fishCards).toHaveCount(6);
  await expect(page.locator(".complete-fish-card-status")).toHaveText(["✓ 発見済み", "✓ 発見済み", "✓ 発見済み", "✓ 発見済み", "✓ 発見済み", "✓ 発見済み"]);
  for (let index = 0; index < 6; index += 1) {
    const card = fishCards.nth(index);
    await card.click();
    const selectedFishName = await card.locator("strong").innerText();
    await expect(page.getByRole("heading", { name: selectedFishName, exact: true })).toBeVisible();
    await expect(page.locator("#collection-model canvas")).toBeVisible();
    await expect(page.locator(".complete-fish-record-note")).toContainText("展示用");
  }

  await page.getByRole("navigation", { name: "展示内容" }).getByRole("button", { name: "技術ツリー" }).click();
  await expect(page.getByRole("heading", { name: "技術ツリー" })).toBeVisible();
  await expect(page.locator(".tech-tree-node.is-unlocked")).toHaveCount(6);
  await expect(page.locator(".tech-tree-node-mark")).toHaveText(["✓", "✓", "✓", "✓", "✓", "✓"]);

  await page.getByRole("navigation", { name: "展示内容" }).getByRole("button", { name: "魚図鑑" }).click();
  const desktopWidth = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(desktopWidth.document).toBeLessThanOrEqual(desktopWidth.viewport);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "魚図鑑コンプリート" })).toBeVisible();
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  expect(apiRequests).toEqual([]);
  expect(sockets).toEqual([]);
});
