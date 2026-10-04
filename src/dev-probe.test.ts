import assert from "node:assert/strict";
import test from "node:test";
import { isExpectedDevService } from "../scripts/dev-probe.js";

test("dev runner only reuses the gijutu-turi backend health response", async () => {
  const expected = await isExpectedDevService(8787, "backend", async () => new Response(
    JSON.stringify({ ok: true, service: "gijutu-turi-backend" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));
  const other = await isExpectedDevService(8787, "backend", async () => new Response(
    JSON.stringify({ ok: true, service: "another-app" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ));

  assert.equal(expected, true);
  assert.equal(other, false);
});

test("dev runner identifies Vite and treats an unrelated or failed probe as occupied", async () => {
  const vite = await isExpectedDevService(8788, "vite", async () => new Response(
    "function createHotContext() {}",
    { status: 200, headers: { "Content-Type": "text/javascript" } },
  ));
  const unrelated = await isExpectedDevService(8788, "vite", async () => new Response(
    "not vite",
    { status: 200, headers: { "Content-Type": "text/html" } },
  ));
  const unavailable = await isExpectedDevService(8788, "vite", async () => { throw new Error("offline"); });

  assert.equal(vite, true);
  assert.equal(unrelated, false);
  assert.equal(unavailable, false);
});
