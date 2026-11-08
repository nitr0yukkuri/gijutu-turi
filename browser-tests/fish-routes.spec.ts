import { expect, test, type Page } from "@playwright/test";

const routes = ["/", "/gofish", "/dockerwhale", "/cssfish", "/k8sfish", "/rustfish", "/jseel", "/javatako"];

async function stubCurrentWeather(page: Page): Promise<void> {
  await page.route("**/api/weather**", async route => {
    const waterway = new URL(route.request().url()).searchParams.get("waterway") === "river" ? "river" : "sea";
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        waterway,
        location: waterway === "river" ? "荒川（熊谷付近）" : "東京湾（参考地点）",
        temperatureC: 18,
        weatherCode: 0,
        thunderstormCode: null,
        isDay: true,
        precipitationMm: 0,
        cloudCoverPercent: 15,
        windSpeedMs: 2,
        currentAt: now,
        fetchedAt: now,
      }),
    });
  });
}

for (const route of routes) {
  test(`${route} renders its WebGL scene without browser errors`, async ({ page }) => {
    if (route === "/") test.setTimeout(60_000);
    await stubCurrentWeather(page);
    if (route === "/") {
      // Keep the browser request unqualified, but make the test server choose
      // a fixed species. This exercises the default route without relying on
      // random server selection or pre-creating a separate room.
      await page.route("**/api/ocean-sessions", async route => {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        expect(payload.fishId).toBeUndefined();
        const response = await route.fetch({
          postData: JSON.stringify({ ...payload, fishId: "whale-001" }),
        });
        await route.fulfill({ response });
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
      : route === "/javatako"
        ? ["java-octopus"]
        : ["go-fish"];
    const loadedModelChunks = new Set<string>();
    page.on("response", response => {
      if (response.request().resourceType() !== "script") return;
      const path = new URL(response.url()).pathname;
      if (path.includes("/chunks/go-fish-")) loadedModelChunks.add("go-fish");
      if (path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")) loadedModelChunks.add("docker-whale");
      if (path.includes("/chunks/java-octopus-")) loadedModelChunks.add("java-octopus");
    });
    const modelChunkResponse = page.waitForResponse(response => {
      if (response.request().resourceType() !== "script") return false;
      const path = new URL(response.url()).pathname;
      return expectedModelChunks.some(chunkName => chunkName === "docker-whale"
        ? path.includes("/chunks/docker-whale-") && !path.includes("/chunks/docker-whale-profile-")
        : chunkName === "java-octopus"
          ? path.includes("/chunks/java-octopus-")
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
  await stubCurrentWeather(page);
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
  // This route mounts each high-detail catalog preview in turn; software WebGL
  // needs extra time to compile the current species set.
  test.setTimeout(300_000);
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
  await expect(page.getByRole("link", { name: "川魚の生態と動き" })).toHaveAttribute("href", "/riverfish");
  const progress = page.getByLabel(/発見済み \d+ \/ \d+ 種/);
  await expect(progress).toBeVisible();
  const progressLabel = await progress.getAttribute("aria-label");
  const progressCounts = progressLabel?.match(/発見済み (\d+) \/ (\d+) 種/);
  expect(progressCounts).not.toBeNull();
  expect(progressCounts?.[1]).toBe(progressCounts?.[2]);
  const speciesCount = Number(progressCounts?.[2]);

  const fishCards = page.locator(".complete-fish-card");
  await expect(page.getByRole("heading", { name: "魚図鑑", exact: true })).toBeVisible();
  await expect(fishCards).toHaveCount(speciesCount);
  await expect(page.locator(".complete-fish-card-status")).toHaveCount(0);
  await expect(page.locator(".complete-fish-record-note, .complete-showcase-footer span")).toHaveCount(0);
  for (let index = 0; index < speciesCount; index += 1) {
    const card = fishCards.nth(index);
    await card.click();
    const selectedFishName = await card.locator("strong").innerText();
    await expect(page.getByRole("heading", { name: selectedFishName, exact: true })).toBeVisible();
    await expect(page.locator("#collection-model canvas")).toBeVisible();
  }

  await page.getByRole("navigation", { name: "展示内容" }).getByRole("button", { name: "技術ツリー" }).click();
  await expect(page.getByRole("heading", { name: "技術ツリー" })).toBeVisible();
  await expect(page.locator(".tech-tree-node.is-unlocked")).toHaveCount(speciesCount);
  await expect(page.locator(".tech-tree-node-mark")).toHaveCount(0);

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

test("/riverfish shows detailed river species without opening game APIs", async ({ page }) => {
  const apiRequests: string[] = [];
  const sockets: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) apiRequests.push(`${request.method()} ${url.pathname}`);
  });
  page.on("websocket", socket => sockets.push(socket.url()));

  await page.goto("/riverfish");
  await expect(page.getByRole("heading", { name: "川の技術魚" })).toBeVisible();
  const picker = page.getByRole("navigation", { name: "川魚を選ぶ" });
  await expect(picker.getByRole("button")).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Goアユ", exact: true })).toBeVisible();
  await expect(page.locator(".river-fish-facts")).toContainText("実際の生態");
  await expect(page.locator(".river-fish-model canvas")).toBeVisible();

  await picker.getByRole("button", { name: /Rustヤマメ/ }).click();
  await expect(page.getByRole("heading", { name: "Rustヤマメ", exact: true })).toBeVisible();
  await expect(page.locator(".river-fish-facts")).toContainText("冷たく澄んだ上流域");
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  expect(apiRequests).toEqual([]);
  expect(sockets).toEqual([]);
});


test("/complete?species=java-001 opens the Java octopus preview directly", async ({ page }) => {
  await page.goto("/complete?species=java-001");

  await expect(page.locator(".complete-fish-card[aria-pressed=\"true\"]")).toContainText("Javaタコ");
  await expect(page.getByRole("heading", { name: "Javaタコ", exact: true })).toBeVisible();
  await expect(page.locator("#collection-model canvas")).toBeVisible();
});
