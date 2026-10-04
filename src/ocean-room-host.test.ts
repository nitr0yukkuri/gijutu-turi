import assert from "node:assert/strict";
import { networkInterfaces } from "node:os";
import { test } from "node:test";
import { accessHost } from "./ocean-room.js";

const fakeInterfaces = (interfaces: ReturnType<typeof networkInterfaces>): ReturnType<typeof networkInterfaces> => interfaces;

test("localhost room links prefer a Wi-Fi private IPv4 address over virtual adapters", () => {
  const interfaces = fakeInterfaces({
    "vEthernet (Default Switch)": [{ address: "172.28.0.1", family: "IPv4", internal: false, cidr: "172.28.0.1/20", mac: "00:00:00:00:00:01", netmask: "255.255.240.0" }],
    "Wi-Fi": [{ address: "192.168.1.23", family: "IPv4", internal: false, cidr: "192.168.1.23/24", mac: "00:00:00:00:00:02", netmask: "255.255.255.0" }],
  });
  assert.equal(accessHost("http://localhost:8788/api/ocean-sessions", interfaces), "192.168.1.23");
});

test("an externally reachable request host is preserved", () => {
  assert.equal(accessHost("https://game.example/api/ocean-sessions", fakeInterfaces({})), "game.example");
});

test("localhost does not fall back to an unusable localhost phone link", () => {
  assert.equal(accessHost("http://127.0.0.1:8788/api/ocean-sessions", fakeInterfaces({})), undefined);
});

test("localhost ignores virtual-only adapters that a phone cannot use as its route", () => {
  const interfaces = fakeInterfaces({
    "vEthernet (Default Switch)": [{ address: "172.28.0.1", family: "IPv4", internal: false, cidr: "172.28.0.1/20", mac: "00:00:00:00:00:01", netmask: "255.255.240.0" }],
  });
  assert.equal(accessHost("http://localhost:8788/api/ocean-sessions", interfaces), undefined);
});
