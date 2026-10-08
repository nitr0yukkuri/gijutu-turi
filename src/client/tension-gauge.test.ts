import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TensionGauge } from "./TensionGauge.js";

const render = (value: number, lunge = 0, warning = false) => renderToStaticMarkup(createElement(TensionGauge, { value, lunge, warning }));

test("tension risk is readable without relying on color, including both warning boundaries", () => {
  for (const [value, level, label] of [[0, "slack", "ゆるい"], [11, "slack", "ゆるい"], [12, "steady", "安定"], [65, "steady", "安定"], [66, "high", "張りが強い"], [80, "high", "張りが強い"], [81, "danger", "切れそう"], [100, "danger", "切れそう"]] as const) {
    const html = render(value);
    assert.ok(html.includes(`data-level="${level}"`));
    assert.ok(html.includes(`aria-valuenow="${value}"`));
    assert.ok(html.includes(`aria-valuetext="${value}%、${label}`));
  }
  assert.match(render(95), /切れそう。巻くのを止める/);
});

test("K8s projected load stops at the end of the meter and remains distinct from actual tension", () => {
  const html = render(90, 1);
  assert.match(html, /aria-valuenow="90"/);
  assert.match(html, /class="tension-gauge-impact"[^>]*stroke-dasharray="10 100"[^>]*stroke-dashoffset="-90"/);
  assert.match(render(50, 0, true), /安定。強い引きに注意/);
  assert.match(render(100, 1), /data-lunge="false"/);
});

test("invalid presentation values cannot produce an invalid SVG or out-of-range accessible value", () => {
  for (const [input, expected] of [[NaN, 0], [Infinity, 0], [-10, 0], [110, 100]] as const) {
    const html = render(input, NaN);
    assert.ok(html.includes(`aria-valuenow="${expected}"`));
    assert.doesNotMatch(html, /NaN|Infinity/);
  }
});
