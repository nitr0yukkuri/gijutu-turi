import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedWebSocketOrigin } from "./ocean-room.js";

test("WebSocket origins allow same-host, explicitly configured, and deliberate wildcard cases", () => {
  const configured = new Set(["https://game.example"]);
  assert.equal(isAllowedWebSocketOrigin(undefined, "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("http://localhost:8787", "localhost:8787", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://game.example", "api.example", configured), true);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("not an origin", "api.example", configured), false);
  assert.equal(isAllowedWebSocketOrigin("https://other.example", "api.example", new Set(["*"])), true);
});
