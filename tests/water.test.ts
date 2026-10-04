import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleFloodHeight } from '../src/game/Water.ts';

test('expanded flood surface stays finite and below a safe visual wave height', () => {
  let lowest = Infinity, highest = -Infinity;
  for (let time = 0; time < 90; time += 1.7) {
    for (let x = -100; x <= 100; x += 7) {
      for (let z = -100; z <= 100; z += 11) {
        const height = sampleFloodHeight(x, z, time);
        assert.ok(Number.isFinite(height));
        assert.ok(Math.abs(height) <= 0.18 + Number.EPSILON,
          'stronger waves must not lift the boat or a clinging survivor excessively');
        lowest = Math.min(lowest, height);
        highest = Math.max(highest, height);
      }
    }
  }
  assert.ok(highest - lowest > 0.3, 'the surface should have visible swells');
});

test('floating props can sample continuous movement across render frames', () => {
  for (const [x, z] of [[0, 27], [-15, 0], [88, -88]]) {
    for (let time = 0; time < 30; time += 0.25) {
      const before = sampleFloodHeight(x, z, time);
      const after = sampleFloodHeight(x, z, time + 1 / 60);
      assert.ok(Math.abs(after - before) < 0.004,
        'sampled waterline must move gently even at the map edge');
    }
  }
  assert.notEqual(sampleFloodHeight(0, 0, 0), sampleFloodHeight(25, 20, 0));
  assert.notEqual(sampleFloodHeight(0, 0, 0), sampleFloodHeight(0, 0, 1));
});
