import assert from 'node:assert/strict';
import test from 'node:test';
import { SurvivorCalls, type CallingSurvivor } from '../src/game/SurvivorCalls.ts';

const listener = { x: 0, y: 0, z: 0 };
const person = (id = 'A-1', x = 8, y = 0, z = 0, state = 'WAITING'): CallingSurvivor => ({ id, state, position: { x, y, z } });

test('help waits for a nearby approach and only emits one nearest voice', () => {
  const calls = new SurvivorCalls(() => 0);
  const group = [person('A-1', 12), person('A-2', 8), person('A-3', 10)];
  assert.equal(calls.update(4, group, listener, true), null);
  assert.deepEqual(calls.update(1, group, listener, true), { id: 'A-2', distance: 8, position: { x: 8, y: 0, z: 0 } });
  assert.equal(calls.update(0, group, listener, true), null);
});

test('range uses all three dimensions and never calls from a distant roof or group', () => {
  const calls = new SurvivorCalls(() => 0);
  assert.equal(calls.update(20, [person('far', 18.1)], listener, true), null);
  assert.equal(calls.update(20, [person('roof', 1, 18)], listener, true), null);
  assert.equal(calls.update(4, [person('edge', 0, 18)], listener, true), null);
  assert.equal(calls.update(1, [person('edge', 0, 18)], listener, true)?.id, 'edge');
});

test('initial delay and repeat interval are independently randomized', () => {
  const values = [0.5, 0.8, 0];
  const calls = new SurvivorCalls(() => values.shift() ?? 0);
  const group = [person()];
  assert.equal(calls.update(6, group, listener, true), null);
  assert.ok(calls.update(1, group, listener, true), 'midpoint random waits seven seconds');
  assert.equal(calls.update(36, group, listener, true), null);
  assert.ok(calls.update(1, group, listener, true), 'next voice waits 37 seconds');
});

test('shortest repeat interval is 25 seconds even among multiple groups', () => {
  const calls = new SurvivorCalls(() => 0);
  assert.ok(calls.update(5, [person('A')], listener, true));
  assert.equal(calls.update(5, [person('B')], listener, true), null);
  assert.equal(calls.update(19, [person('C')], listener, true), null);
  assert.equal(calls.update(1, [person('C')], listener, true)?.id, 'C');
});

test('leaving range resets the approach delay without resetting the shared cooldown', () => {
  const calls = new SurvivorCalls(() => 0);
  assert.ok(calls.update(5, [person('A')], listener, true));
  assert.equal(calls.update(2, [], listener, true), null);
  assert.equal(calls.update(5, [person('B')], listener, true), null);
  assert.equal(calls.update(17, [person('B')], listener, true), null);
  assert.equal(calls.update(1, [person('B')], listener, true)?.id, 'B');
});

test('a later approach still waits before speaking after cooldown expired out of range', () => {
  const calls = new SurvivorCalls(() => 0);
  assert.ok(calls.update(5, [person('A')], listener, true));
  assert.equal(calls.update(50, [], listener, true), null);
  assert.equal(calls.update(4, [person('B')], listener, true), null);
  assert.equal(calls.update(1, [person('B')], listener, true)?.id, 'B');
});

test('boarding, aboard, disembarking, and safe survivors never ask for rescue', () => {
  const calls = new SurvivorCalls(() => 0);
  const rescued = ['BOARDING', 'PASSENGER', 'DISEMBARKING', 'SAFE'].map(state => person(state, 1, 0, 0, state));
  assert.equal(calls.update(100, rescued, listener, true), null);
  assert.equal(calls.update(4, [...rescued, person('waiting', 10)], listener, true), null);
  assert.equal(calls.update(1, [...rescued, person('waiting', 10)], listener, true)?.id, 'waiting');
});

test('ineligible time freezes cooldown and resumes with no overdue call', () => {
  const calls = new SurvivorCalls(() => 0);
  const group = [person()];
  assert.ok(calls.update(5, group, listener, true));
  assert.equal(calls.update(10, group, listener, true), null);
  assert.equal(calls.update(100, group, listener, false), null);
  assert.equal(calls.update(14, group, listener, true), null);
  assert.ok(calls.update(1, group, listener, true));
});

test('pausing an initial approach starts a fresh quiet approach on resume', () => {
  const calls = new SurvivorCalls(() => 0);
  const group = [person()];
  assert.equal(calls.update(4, group, listener, true), null);
  assert.equal(calls.update(100, group, listener, false), null);
  assert.equal(calls.update(4, group, listener, true), null);
  assert.ok(calls.update(1, group, listener, true));
});

test('restart clears earlier cooldown but retains the initial quiet delay', () => {
  const calls = new SurvivorCalls(() => 0);
  const group = [person()];
  assert.ok(calls.update(5, group, listener, true));
  calls.reset();
  assert.equal(calls.update(4, group, listener, true), null);
  assert.ok(calls.update(1, group, listener, true));
});

test('returned call position is a snapshot and invalid elapsed times cannot advance calls', () => {
  const calls = new SurvivorCalls(() => 0);
  const survivor = person();
  for (const dt of [NaN, Infinity, -10]) assert.equal(calls.update(dt, [survivor], listener, true), null);
  const call = calls.update(5, [survivor], listener, true)!;
  survivor.position.x = 100;
  assert.equal(call.position.x, 8);
});
