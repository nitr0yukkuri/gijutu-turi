import assert from "node:assert/strict";
import { test } from "node:test";
import { readSmallJson } from "./read-small-json.js";

test("readSmallJson accepts a small JSON request", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ waterway: "river" }),
  });

  assert.deepEqual(await readSmallJson(request), { ok: true, value: { waterway: "river" } });
});

test("readSmallJson cancels a stream as soon as it crosses the 1 KiB limit", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(600)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  assert.deepEqual(await readSmallJson(request), { ok: false, status: 413, error: "payload_too_large" });
  assert.equal(cancelled, true);
});

test("readSmallJson rejects an oversized declared body without parsing it", async () => {
  const request = new Request("https://example.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "1025" },
    body: "{}",
  });

  assert.deepEqual(await readSmallJson(request), { ok: false, status: 413, error: "payload_too_large" });
});
