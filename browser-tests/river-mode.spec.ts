import { expect, test, type Page } from "@playwright/test";

type OceanState = { fishId?: string; phase?: string };
type OceanConnection = { roomId: string | null; states: OceanState[] };

function captureOceanConnections(page: Page): OceanConnection[] {
  const connections: OceanConnection[] = [];
  page.on("websocket", socket => {
    const connection: OceanConnection = {
      roomId: new URL(socket.url()).searchParams.get("room"),
      states: [],
    };
    connections.push(connection);
    socket.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(payload.toString()) as { type?: string; state?: OceanState };
        if (message.type === "ocean" && message.state) connection.states.push(message.state);
      } catch {
        // Ignore non-JSON frames; valid game snapshots are checked below.
      }
    });
  });
  return connections;
}

async function pinEncounterByWaterway(page: Page, requestedWaterways: string[], roomStatuses: number[]) {
  await page.route("**/api/ocean-sessions", async route => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    const waterway = payload.waterway;
    expect(waterway === "sea" || waterway === "river").toBe(true);
    requestedWaterways.push(waterway as string);

    const fishId = waterway === "river" ? "river-yamame" : "fish-001";
    const response = await route.fetch({
      postData: JSON.stringify({ ...payload, fishId }),
    });
    roomStatuses.push(response.status());
    await route.fulfill({ response });
  });
}

async function waitForScene(page: Page, waterway: "sea" | "river") {
  const ocean = page.locator("#ocean");
  await expect(ocean).toHaveAttribute("data-waterway", waterway);
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#ocean")?.dataset.ready === "true");
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
}

test("/?waterway=river starts a river room and loads the river environment", async ({ page }) => {
  test.setTimeout(60_000);
  const requestedWaterways: string[] = [];
  const roomStatuses: number[] = [];
  const connections = captureOceanConnections(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const riverBedResponses: number[] = [];

  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname.includes("river-bed-color")) riverBedResponses.push(response.status());
  });
  await pinEncounterByWaterway(page, requestedWaterways, roomStatuses);

  await page.goto("/?waterway=river");
  await waitForScene(page, "river");
  await expect.poll(() => connections.some(connection => connection.states.some(state => state.fishId === "river-yamame" && state.phase === "idle")), {
    timeout: 20_000,
  }).toBe(true);
  await expect.poll(() => riverBedResponses.length, { timeout: 20_000 }).toBeGreaterThan(0);

  expect(requestedWaterways).toEqual(["river"]);
  expect(roomStatuses).toEqual([201]);
  expect(riverBedResponses.every(status => status === 200)).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("switching from sea to river creates a river room with a river fish", async ({ page }) => {
  test.setTimeout(60_000);
  const requestedWaterways: string[] = [];
  const roomStatuses: number[] = [];
  const connections = captureOceanConnections(page);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await pinEncounterByWaterway(page, requestedWaterways, roomStatuses);

  await page.goto("/");
  await expect(page.locator("#ocean")).toBeVisible();
  await expect.poll(() => connections.some(connection => connection.states.some(state => state.fishId === "fish-001" && state.phase === "idle")), {
    timeout: 15_000,
  }).toBe(true);
  const seaRoomId = connections.at(-1)?.roomId;
  expect(seaRoomId).toBeTruthy();
  expect(requestedWaterways).toEqual(["sea"]);

  const riverConnectionOffset = connections.length;
  const riverRoomRequest = page.waitForRequest(request => {
    if (new URL(request.url()).pathname !== "/api/ocean-sessions") return false;
    return (request.postDataJSON() as Record<string, unknown>).waterway === "river";
  });
  await page.getByRole("navigation", { name: "釣り場を選択" }).getByRole("button", { name: "川" }).click();
  await riverRoomRequest;
  await expect(page).toHaveURL(/\?waterway=river(?:$|&)/);
  await expect(page.getByRole("navigation", { name: "釣り場を選択" }).getByRole("button", { name: "川" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#ocean")).toHaveAttribute("data-waterway", "river");
  await expect.poll(() => connections.length > riverConnectionOffset
    && connections.at(-1)?.roomId !== seaRoomId
    && connections.at(-1)?.states.some(state => state.fishId === "river-yamame" && state.phase === "idle"), {
    timeout: 30_000,
  }).toBe(true);

  expect(requestedWaterways).toEqual(["sea", "river"]);
  expect(roomStatuses).toEqual([201, 201]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

