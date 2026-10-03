import assert from "node:assert/strict";
import { test } from "node:test";
import { FISHING_ROUTE_PATHS } from "../fishing-routes.js";
import { createControllerLink } from "./controller-url.js";

test("a localhost display gets a phone URL on the PC LAN host and same port", () => {
  const link = createControllerLink("http://localhost:8788", "/gofish", "sea_123", "192.168.1.20");
  assert.deepEqual(link, {
    href: "http://192.168.1.20:8788/gofish?controller=sea_123",
    host: "192.168.1.20",
  });
});

test("the K8s route stays pinned when its controller link is opened on a phone", () => {
  const link = createControllerLink("http://localhost:8788", FISHING_ROUTE_PATHS.k8sfish, "sea_123", "192.168.1.20");
  assert.deepEqual(link, {
    href: "http://192.168.1.20:8788/k8sfish?controller=sea_123",
    host: "192.168.1.20",
  });
});

test("a loopback phone URL is withheld if the PC LAN host is unavailable", () => {
  assert.equal(createControllerLink("http://127.0.0.1:8788", "/", "sea_123"), null);
  assert.equal(createControllerLink("http://localhost:8788", "/", "sea_123", "localhost"), null);
});

test("a non-local origin is preserved instead of replaced by the backend host", () => {
  const link = createControllerLink("https://game.example:9443", "/", "sea_123", "192.168.1.20");
  assert.deepEqual(link, {
    href: "https://game.example:9443/?controller=sea_123",
    host: "game.example",
  });
});

test("static hosts can keep controller links on the root page and retain the fish selection", () => {
  const link = createControllerLink(
    "https://game.example",
    "/cssfish",
    "sea_123",
    undefined,
    { routeMode: "query", fishQuery: "cssfish" },
  );
  assert.deepEqual(link, {
    href: "https://game.example/?fish=cssfish&controller=sea_123",
    host: "game.example",
  });
});
