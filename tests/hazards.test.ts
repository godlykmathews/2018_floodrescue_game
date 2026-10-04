import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { BoatController } from '../src/game/BoatController.ts';
import { World } from '../src/game/World.ts';
import { Rain } from '../src/game/Rain.ts';
import { LEVELS } from '../src/game/LevelManager.ts';

const idle = { throttle: 0, steer: 0, brake: false };
const wall = { minX: -10, maxX: 10, minZ: -5, maxZ: 0 };

function impact(boat: BoatController, speed: number) {
  boat.position.set(0, 0, 2.0);
  boat.velocity.set(0, 0, -speed);
  boat.update(1 / 60, idle, [wall]);
}

test('omitted current and an explicit zero vector preserve identical existing handling', () => {
  const original = new BoatController(), calm = new BoatController();
  for (let frame = 0; frame < 300; frame++) {
    const input = { throttle: 1, steer: 0.3, brake: false };
    original.update(1 / 60, input);
    calm.update(1 / 60, input, [], new Vector3());
  }
  assert.ok(original.position.equals(calm.position));
  assert.ok(original.velocity.equals(calm.velocity));
  assert.equal(original.yaw, calm.yaw);
});

test('current produces controllable drift while braking stays comfortably below rescue speed', () => {
  const drifting = new BoatController(), braking = new BoatController();
  const current = new Vector3(0.3, 0, 0.5);
  for (let frame = 0; frame < 600; frame++) {
    drifting.update(1 / 60, idle, [], current);
    braking.update(1 / 60, { ...idle, brake: true }, [], current);
  }
  assert.ok(drifting.position.distanceTo(new Vector3(0, 0, 27)) > 2, 'the flood current should visibly move an idle boat');
  assert.ok(drifting.speed < 2.6, 'even strong current should remain manageable');
  assert.ok(braking.speed < 0.2, 'held brake must permit a safe rescue in strong current');
  assert.ok(braking.speed < drifting.speed * 0.2);
  braking.locked = true;
  const before = braking.position.clone();
  braking.update(0.5, { throttle: 1, steer: 1, brake: false }, [], current);
  assert.ok(braking.position.equals(before), 'a transfer lock must also resist current');
  assert.equal(braking.speed, 0);
});

test('strong collision reports inward speed once and respects its cooldown', () => {
  const boat = new BoatController(), events: number[] = [];
  boat.onCollision = speed => events.push(speed);
  impact(boat, 8);
  assert.equal(events.length, 1);
  assert.ok(events[0] > 7 && events[0] <= 8, 'impact reports approach speed before collision damping');
  for (let frame = 0; frame < 20; frame++) impact(boat, 8);
  assert.equal(events.length, 1, 'multiple hull contacts and nearby frames must not multiply damage');
  for (let frame = 0; frame < 60; frame++) boat.update(1 / 60, idle);
  impact(boat, 8);
  assert.equal(events.length, 2, 'a separate later impact should be reported');
});

test('mild contacts do not trigger damage and restart resets the impact cooldown', () => {
  const boat = new BoatController();
  let events = 0;
  boat.onCollision = () => events++;
  for (let frame = 0; frame < 20; frame++) impact(boat, 2);
  assert.equal(events, 0);
  impact(boat, 7);
  assert.equal(events, 1);
  boat.reset();
  impact(boat, 7);
  assert.equal(events, 2);
});

test('difficulty enables exactly the configured debris count without duplicate or invisible colliders', () => {
  const world = new World();
  const debris = world.root.children.filter(object => object.name.startsWith('FLOATING_'));
  const fixedCount = world.colliders.length - debris.filter(object => object.visible).length;
  for (const level of [...LEVELS, LEVELS[0], LEVELS[1]]) {
    world.setDifficulty(level);
    assert.equal(debris.filter(object => object.visible).length, level.debrisCount);
    assert.equal(world.colliders.length, fixedCount + level.debrisCount);
    assert.equal(new Set(world.colliders).size, world.colliders.length);
    for (const object of debris.filter(object => object.visible)) {
      assert.ok(world.colliders.some(box => Math.abs((box.minX + box.maxX) / 2 - object.position.x) < 1e-9
        && Math.abs((box.minZ + box.maxZ) / 2 - object.position.z) < 1e-9));
    }
  }
});

test('drifting debris keeps collision bounds synchronized and restart restores its anchors', () => {
  const world = new World();
  world.setDifficulty(LEVELS[2]);
  const debris = world.root.children.filter(object => object.visible && object.name.startsWith('FLOATING_'));
  const anchors = debris.map(object => object.position.clone());
  const colliders = debris.map(object => world.colliders.find(box => Math.abs((box.minX + box.maxX) / 2 - object.position.x) < 1e-9
    && Math.abs((box.minZ + box.maxZ) / 2 - object.position.z) < 1e-9)!);
  for (let frame = 0; frame < 600; frame++) {
    const before = debris.map(object => object.position.clone());
    world.update(frame / 60, 1 / 60);
    debris.forEach((object, index) => {
      const box = colliders[index];
      assert.ok(Math.abs((box.minX + box.maxX) / 2 - object.position.x) < 1e-9);
      assert.ok(Math.abs((box.minZ + box.maxZ) / 2 - object.position.z) < 1e-9);
      assert.ok(Math.hypot(object.position.x - before[index].x, object.position.z - before[index].z) < 0.025,
        'debris should drift rather than teleport');
      assert.ok(Math.hypot(object.position.x - anchors[index].x, object.position.z - anchors[index].z) < 1,
        'bounded eddies should not wander across the whole navigation lane');
      for (const [x, z] of [[0, -18], [-15, 4.2], [27.8, -12], [24, 19.5]]) {
        const closestX = Math.max(box.minX, Math.min(x, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
        assert.ok(Math.hypot(x - closestX, z - closestZ) >= 4,
          'floating debris must remain outside the rescue and disembarking pockets');
      }
    });
  }
  assert.ok(debris.some((object, index) => Math.hypot(object.position.x - anchors[index].x, object.position.z - anchors[index].z) > 0.1));
  world.setDifficulty(LEVELS[2]);
  debris.forEach((object, index) => assert.ok(object.position.equals(anchors[index])));
});

test('current strength varies by region and level but calms around every rescue and relief dock', () => {
  const world = new World(), out = new Vector3();
  assert.equal(world.getCurrent(new Vector3(40, 0, 0), out).length(), 0);
  world.setDifficulty(LEVELS[1]);
  const western = world.getCurrent(new Vector3(-30, 0, 0), out).length();
  const eastern = world.getCurrent(new Vector3(40, 0, 0), out).length();
  assert.ok(eastern > western);
  for (const [x, z] of [[0, -18], [-15, 4.2], [27.8, -12], [24, 19.5]]) {
    assert.equal(world.getCurrent(new Vector3(x, 0, z), out), out, 'current queries should reuse the supplied vector');
    assert.ok(out.length() < eastern * 0.15, 'boarding and unloading basins should be sheltered');
    assert.equal(out.y, 0);
  }
  world.setDifficulty(LEVELS[2]);
  assert.ok(world.getCurrent(new Vector3(40, 0, 0), out).length() > eastern);
});

test('weather difficulty increases streak count within one bounded rain geometry', () => {
  const rain = new Rain();
  const geometry = rain.mesh.geometry;
  rain.setIntensity(1);
  assert.equal(geometry.drawRange.count, 3400);
  rain.setIntensity(1.35);
  assert.equal(rain.mesh.geometry, geometry);
  assert.equal(geometry.drawRange.count, 4590);
  rain.setIntensity(50);
  assert.ok(geometry.drawRange.count <= geometry.getAttribute('position').count);
  rain.setIntensity(1);
  assert.equal(geometry.drawRange.count, 3400);
});
