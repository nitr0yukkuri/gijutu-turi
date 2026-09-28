import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CAST_MAX_DISTANCE_METERS,
  CAST_MAX_STRENGTH,
  CAST_MIN_DISTANCE_METERS,
  CAST_MIN_STRENGTH,
  castDistanceForStrength,
} from './cast-distance.js';

test('cast distance maps the full input range to 10–35 metres',()=>{
  assert.equal(castDistanceForStrength(CAST_MIN_STRENGTH),CAST_MIN_DISTANCE_METERS);
  assert.equal(castDistanceForStrength(CAST_MAX_STRENGTH),CAST_MAX_DISTANCE_METERS);
  assert.equal(castDistanceForStrength(.45),17.8125);
  assert.equal(castDistanceForStrength(.65),24.0625);
});

test('cast distance clamps invalid and out-of-range strengths',()=>{
  assert.equal(castDistanceForStrength(-1),CAST_MIN_DISTANCE_METERS);
  assert.equal(castDistanceForStrength(2),CAST_MAX_DISTANCE_METERS);
  assert.equal(castDistanceForStrength(Number.NaN),CAST_MIN_DISTANCE_METERS);
});
