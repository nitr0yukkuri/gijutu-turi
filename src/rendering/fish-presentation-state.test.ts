import assert from 'node:assert/strict';
import test from 'node:test';
import { OceanFishingGame } from '../ocean-game.js';
import { FISH_SPECIES } from '../fish-species.js';
import { OceanPresentationTimeline } from '../ocean-presentation-timeline.js';
import { copyFishMotion, interpolateFishPresentationState } from './fish-presentation-state.js';
import { fishFightCues } from './fish-fight-cues.js';

test('every species renders finite fight loads from real wire snapshots on the delayed clock', () => {
  for (const species of FISH_SPECIES) {
    const game = new OceanFishingGame(() => .5, species.id);
    let now = 1000;
    game.action({ action: 'cast', strength: .5, aim: 0 }, now);
    for (let i = 0; i < 1000 && game.state.phase !== 'biting'; i++) {
      now += 50;
      game.step(.05, false, now);
    }
    assert.equal(game.state.phase, 'biting', species.id);
    game.action({ action: 'hook' }, now);
    for (let i = 0; i < 40; i++) { now += 50; game.step(.05, false, now); }
    assert.equal(game.state.phase, 'fighting', species.id);

    const first = game.wireSnapshot();
    assert.equal('tension' in first.fish, false, 'tension belongs to the game, not fish motion');
    const timeline = new OceanPresentationTimeline(100);
    timeline.push(first, now, now);
    const single = timeline.sampleWith(interpolateFishPresentationState, now + 100);
    assert.ok(single?.fish);
    assert.equal(fishFightCues(single.fish, single.tension).load, first.tension);

    game.step(.1, false, now + 100);
    const second = game.wireSnapshot();
    timeline.push(second, now + 100, now + 100);
    const middle = timeline.sampleWith(interpolateFishPresentationState, now + 150);
    assert.ok(middle?.fish);
    const cues = fishFightCues(middle.fish, middle.tension);
    assert.equal(cues.load, (first.tension + second.tension) / 2);
    assert.ok(Object.values(cues).every(Number.isFinite), species.id);
    assert.equal(middle.fish.position.x, (first.fish.position.x + second.fish.position.x) / 2);
    assert.equal(middle.distance, timeline.sample(now + 150)?.distance, 'fish and HUD share render time');
    assert.equal('tension' in middle.fish, false);
  }
});

test('zero tension and missing pre-server fish remain valid presentation states', () => {
  const state = new OceanFishingGame(() => .5).wireSnapshot();
  const before = { ...state, fish: undefined, tension: 0 };
  assert.equal(interpolateFishPresentationState(before, before, 0).fish, undefined);
  const sampled = interpolateFishPresentationState(before, { ...state, tension: 0 }, .5);
  assert.ok(sampled.fish);
  assert.equal(fishFightCues(sampled.fish, sampled.tension).load, 0);
  const copy = copyFishMotion(state.fish);
  assert.ok(copy);
  copy.position.x += 20;
  assert.notEqual(copy.position.x, state.fish.position.x, 'catch pose does not mutate wire snapshots');
});

test('invalid tension cannot poison rod, line opacity or fin cues', () => {
  const fish = new OceanFishingGame(() => .5).wireSnapshot().fish;
  for (const tension of [NaN, Infinity, -Infinity]) {
    const cues = fishFightCues(fish, tension);
    assert.equal(cues.load, 0);
    assert.ok(Object.values(cues).every(Number.isFinite));
  }
});
