import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchFraming } from './catch-framing.js';
import { fishScaleForResponsiveCamera } from './fish-camera-scale.js';

test('K8s result landscape reserves the left side for copy', () => {
  const aspect = 1.5;
  const fov = 46;
  const frame = catchFraming('k8s-001', aspect, fov);
  const halfWidth = frame.depth * Math.tan(fov * Math.PI / 360) * aspect;

  assert.equal(frame.duration, .82);
  assert.equal(frame.depth, 9.5);
  assert.equal(frame.screenX, halfWidth * .4);
  assert.equal(frame.screenY, -.48);
  assert.equal(frame.lift, .48);
  assert.equal(frame.baseScale, .96);
});

test('K8s result framing remains centered and height-safe in portrait', () => {
  const frame = catchFraming('k8s-001', .5, 64);

  assert.equal(frame.screenX, 0);
  assert.equal(frame.depth, 9.5 * 1.4 / .5);
  assert.equal(frame.screenY, -.48);
});

test('caught-fish framing preserves its width across landscape, square, and portrait viewports', () => {
  const viewports = [
    { aspect: 1.4, fov: 46, blend: 0 },
    { aspect: 1, fov: 46, blend: 0 },
    { aspect: .5, fov: 64, blend: 1 },
  ];
  const projectedWidth = ({ aspect, fov, blend }: typeof viewports[number]) => {
    const frame = catchFraming('k8s-001', aspect, fov);
    const scale = fishScaleForResponsiveCamera(frame.baseScale, fov, blend);
    return scale / (frame.depth * Math.tan(fov * Math.PI / 360) * aspect);
  };

  const reference = projectedWidth({ aspect: 1.4, fov: 46, blend: 0 });
  for (const viewport of viewports.slice(1)) {
    assert.ok(Math.abs(projectedWidth(viewport) / reference - 1) < 1e-10, `unexpected width at aspect ${viewport.aspect}`);
  }
});

test('wide landscape composition remains unchanged', () => {
  const aspect = 1.5;
  const depth = 8.8;
  const go = catchFraming('fish-001', aspect, 46);
  const css = catchFraming('css-001', aspect, 46);
  const whale = catchFraming('whale-001', aspect, 46);

  assert.equal(go.depth, depth);
  assert.equal(go.screenX, depth * Math.tan(46 * Math.PI / 360) * aspect * .24 - .95);
  assert.equal(go.screenY, .15);
  assert.equal(go.duration, 1.2);
  assert.equal(go.baseScale, 1.1);
  assert.equal(css.baseScale, .88);
  assert.equal(whale.baseScale, .57);
  assert.equal(whale.lift, 1.35);
});
