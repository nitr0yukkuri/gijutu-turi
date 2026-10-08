import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TensionGauge } from "./TensionGauge.js";

const render = (value: number, lunge = 0, warning = false) => renderToStaticMarkup(createElement(TensionGauge, { value, lunge, warning }));

test("slack risk uses a visual effect while its meaning remains available to assistive technology", () => {
  for (const [value, level, label] of [[0, "slack", "針外れ注意"], [5, "slack", "針外れ注意"], [6, "slack", "ゆるみ注意"], [11, "slack", "ゆるみ注意"], [12, "steady", "安定"], [65, "steady", "安定"], [66, "high", "張りが強い"], [80, "high", "張りが強い"], [81, "danger", "切れそう"], [100, "danger", "切れそう"]] as const) {
    const html = render(value);
    assert.ok(html.includes(`data-level="${level}"`));
    assert.ok(html.includes(`aria-valuenow="${value}"`));
    assert.ok(html.includes(`aria-valuetext="${value}%、${label}`));
    if (level === "slack") {
      assert.doesNotMatch(html, /<text class="tension-gauge-status"/);
      assert.doesNotMatch(html, /<text class="tension-gauge-hint"/);
    }
  }
  assert.match(render(95), /切れそう。巻くのを止める/);
  assert.match(render(0), /data-critical-slack="true"/);
  assert.match(render(6), /data-critical-slack="false"/);
  assert.match(render(0), /aria-valuetext="0%、針外れ注意。糸を張る"/);
  assert.match(render(6), /aria-valuetext="6%、ゆるみ注意。少し糸を張る"/);
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
