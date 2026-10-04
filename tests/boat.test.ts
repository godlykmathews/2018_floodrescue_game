import assert from 'node:assert/strict';
import test from 'node:test';
import { BoatController, type BoatInput, type Collider } from '../src/game/BoatController.ts';

const idle: BoatInput = { throttle: 0, steer: 0, brake: false };
const ahead: BoatInput = { ...idle, throttle: 1 };
const reverse: BoatInput = { ...idle, throttle: -1 };

function advance(
  boat: BoatController,
  seconds: number,
  input: BoatInput = idle,
  colliders: readonly Collider[] = [],
  fps = 60,
) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    boat.update(1 / fps, input, colliders);
  }
}

function assertHullClear(boat: BoatController, wall: Collider) {
  // Check the complete collision hull rather than only its center.
  for (const offset of [-1.25, 0, 1.25]) {
    const x = boat.position.x + boat.forward.x * offset;
    const z = boat.position.z + boat.forward.z * offset;
    const nearestX = Math.max(wall.minX, Math.min(x, wall.maxX));
    const nearestZ = Math.max(wall.minZ, Math.min(z, wall.maxZ));
    assert.ok(Math.hypot(x - nearestX, z - nearestZ) >= 0.719, 'hull overlaps the wall');
  }
}

test('accelerates gradually, moves forward, and respects maximum cruising speed', () => {
  const boat = new BoatController();
  advance(boat, 0.5, ahead);
  const initialSpeed = boat.speed;
  assert.ok(initialSpeed > 1 && initialSpeed < 3, 'acceleration should build speed gradually');
  assert.ok(boat.position.z < 27, 'forward input should move toward local -Z');
  advance(boat, 7.5, ahead);
  assert.ok(boat.speed > 8 && boat.speed <= 8.2 + 1e-9, 'cruising speed should be capped');
});

test('reverse is controllable and substantially slower than forward travel', () => {
  const boat = new BoatController();
  advance(boat, 6, reverse);
  assert.ok(boat.position.z > 27);
  assert.ok(boat.signedSpeed < -2.5 && boat.signedSpeed >= -2.6 - 1e-9);
});

test('releasing throttle preserves momentum while water drag slows the boat', () => {
  const boat = new BoatController();
  advance(boat, 2, ahead);
  const speed = boat.speed;
  const z = boat.position.z;
  advance(boat, 1);
  assert.ok(boat.position.z < z - 2, 'the boat should coast after throttle release');
  assert.ok(boat.speed > speed * 0.5 && boat.speed < speed, 'water drag should be gradual');
});

test('braking stops the boat much faster than releasing throttle', () => {
  const coast = new BoatController();
  const braking = new BoatController();
  advance(coast, 2, ahead);
  advance(braking, 2, ahead);
  const startZ = braking.position.z;
  advance(coast, 1);
  advance(braking, 1, { ...idle, brake: true });
  assert.ok(braking.speed < 0.3);
  assert.ok(braking.speed < coast.speed * 0.1);
  assert.ok(startZ - braking.position.z < startZ - coast.position.z);
});

test('sideways momentum decays without snapping the velocity to the bow', () => {
  const boat = new BoatController();
  boat.velocity.set(2, 0, -4);
  advance(boat, 0.5);
  assert.ok(boat.position.x > 0.3, 'a boat should drift sideways briefly');
  assert.ok(boat.velocity.x > 0.1 && boat.velocity.x < 2);
  assert.ok(Math.abs(boat.velocity.z) > Math.abs(boat.velocity.x), 'sideways drag should stabilize steering');
});

test('steering builds gradually and has more authority while moving', () => {
  const stationary = new BoatController();
  const moving = new BoatController();
  moving.velocity.set(0, 0, -6);
  const steer: BoatInput = { ...idle, steer: 1 };
  stationary.update(1 / 60, steer);
  assert.ok(Math.abs(stationary.yaw) < 0.01, 'the heading must not snap on the first frame');
  advance(stationary, 1, steer);
  advance(moving, 1, steer);
  assert.ok(moving.yaw < 0, 'right input should turn clockwise from a -Z heading');
  assert.ok(Math.abs(moving.yaw) > Math.abs(stationary.yaw) * 2);
  assert.ok(moving.position.x > 0, 'the boat should follow the turn');
});

test('left and right steering are symmetric, including reverse steering', () => {
  const left = new BoatController();
  const right = new BoatController();
  advance(left, 1.5, { ...ahead, steer: -1 });
  advance(right, 1.5, { ...ahead, steer: 1 });
  assert.ok(Math.abs(left.yaw + right.yaw) < 1e-9);
  assert.ok(Math.abs(left.position.x + right.position.x) < 1e-9);
  const backward = new BoatController();
  advance(backward, 1.5, { ...reverse, steer: 1 });
  assert.ok(backward.yaw > 0, 'reverse travel should reverse steering direction');
});

test('normal desktop frame rates produce closely matching boat motion', () => {
  const slow = new BoatController();
  const fast = new BoatController();
  const input = { ...ahead, steer: 0.35 };
  advance(slow, 3, input, [], 30);
  advance(fast, 3, input, [], 120);
  assert.ok(slow.position.distanceTo(fast.position) < 0.35, '30 and 120 Hz paths should remain close');
  assert.ok(Math.abs(slow.speed - fast.speed) < 0.15);
  assert.ok(Math.abs(slow.yaw - fast.yaw) < 0.04);
});

test('a wall impact pushes the hull clear, reduces speed, and allows reversing away', () => {
  const wall: Collider = { minX: -10, maxX: 10, minZ: -5, maxZ: 0 };
  const boat = new BoatController();
  boat.position.set(0, 0, 2.05);
  boat.velocity.set(0, 0, -8);
  boat.update(1 / 60, ahead, [wall]);
  assertHullClear(boat, wall);
  assert.ok(boat.speed < 3, 'collision should absorb most of the impact speed');
  assert.ok(Number.isFinite(boat.position.z) && Number.isFinite(boat.speed));
  const contactZ = boat.position.z;
  advance(boat, 2, reverse, [wall]);
  assert.ok(boat.position.z > contactZ + 2, 'reverse should free the boat after a collision');
  assertHullClear(boat, wall);
});

test('a boat starting inside an obstacle is separated without invalid state', () => {
  const wall: Collider = { minX: -10, maxX: 10, minZ: -5, maxZ: 0 };
  const boat = new BoatController();
  boat.position.set(0, 0, -2.5);
  advance(boat, 0.1, idle, [wall]);
  assertHullClear(boat, wall);
  assert.ok(boat.position.toArray().every(Number.isFinite));
});

test('locked rescue movement stays fixed and restart restores the initial state', () => {
  const boat = new BoatController();
  advance(boat, 1, { ...ahead, steer: 1 });
  boat.locked = true;
  const before = boat.position.clone();
  advance(boat, 1, ahead);
  assert.ok(boat.position.equals(before));
  assert.equal(boat.speed, 0);
  assert.equal(boat.turnVelocity, 0);
  boat.reset();
  assert.deepEqual(boat.position.toArray(), [0, 0, 27]);
  assert.deepEqual(boat.velocity.toArray(), [0, 0, 0]);
  assert.deepEqual(boat.forward.toArray(), [0, 0, -1]);
  assert.equal(boat.yaw, 0);
  assert.equal(boat.turnVelocity, 0);
  assert.equal(boat.locked, false);
  advance(boat, 0.5, ahead);
  assert.ok(boat.speed > 1, 'restart must re-enable movement');
});
