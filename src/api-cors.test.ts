import assert from "node:assert/strict";
import test from "node:test";
import { apiCorsHeaders } from "./api-cors.js";

test("API CORS exposes Retry-After while allowing only configured origins", () => {
  const configured = new Set(["https://game.example"]);
  const allowed = apiCorsHeaders("https://game.example", configured);
  assert.equal(allowed["Access-Control-Allow-Origin"], "https://game.example");
  assert.equal(allowed["Access-Control-Expose-Headers"], "Retry-After");
  assert.equal(allowed.Vary, "Origin");
  assert.equal(apiCorsHeaders("https://other.example", configured)["Access-Control-Allow-Origin"], undefined);
  assert.equal(apiCorsHeaders("https://other.example", new Set(["*"]))["Access-Control-Allow-Origin"], "*");
});
