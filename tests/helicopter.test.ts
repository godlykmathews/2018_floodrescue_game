import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HelicopterController, type HelicopterInput } from '../src/game/HelicopterController.ts';
import { Helicopter } from '../src/game/Helicopter.ts';
import type { AssetLoader } from '../src/utils/AssetLoader.ts';

const pad = new Vector3(-43, 10.05, 34.28);
const idle: HelicopterInput = { throttle: 0, steer: 0, lift: 0, brake: false };
const ahead = { ...idle, throttle: 1 };
const up = { ...idle, lift: 1 };
const down = { ...idle, lift: -1 };
function helicopter() { const controller = new HelicopterController(); controller.reset(pad); return controller; }
function advance(controller: HelicopterController, seconds: number, input = idle, fps = 60) {
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) controller.update(1 / fps, input);
}
function takeoff(controller: HelicopterController) { advance(controller, 2.5, up); assert.ok(controller.position.y > 20); }

test('parked helicopter stays on the roof until the player explicitly lifts off', () => {
  const controller = helicopter();
  advance(controller, 2, { ...ahead, steer: 1 });
  assert.deepEqual(controller.position.toArray(), pad.toArray());
  assert.equal(controller.landed, true);
  assert.equal(controller.canSwitch, true);
  advance(controller, 0.25, up);
  assert.equal(controller.landed, false);
  assert.equal(controller.canSwitch, false);
  assert.ok(controller.heightAbovePad > 0.2 && controller.heightAbovePad < 0.7, 'takeoff accelerates smoothly');
});

test('horizontal throttle finishes a gentle vertical takeoff before clearing the roof', () => {
  const controller = helicopter();
  advance(controller, 0.2, up);
  for (let frame = 0; frame < 180; frame++) {
    const before = controller.position.clone();
    controller.update(1 / 60, ahead);
    assert.ok(controller.position.distanceTo(before) < 0.12, 'no teleport during ascent');
    if (controller.position.y < 19.975) assert.ok(controller.padDistance < 0.01, 'stays over the roof until safely above it');
  }
  assert.ok(controller.position.y >= 19.975);
  assert.ok(controller.position.z < pad.z, 'forward flight becomes available after ascent');
});

test('flight accelerates forward, limits speed, and hover braking reduces momentum', () => {
  const controller = helicopter();
  takeoff(controller);
  advance(controller, 3, ahead);
  assert.ok(controller.position.z < pad.z - 14);
  assert.ok(controller.speed > 9 && controller.speed <= 12);
  const before = controller.speed;
  advance(controller, 1, { ...idle, brake: true });
  assert.ok(controller.speed < 0.05 && controller.speed < before * 0.01);
});

test('forward and reverse movement remain bounded and steering is gradual and symmetric', () => {
  const left = helicopter(); const right = helicopter(); const reverse = helicopter();
  for (const controller of [left, right, reverse]) takeoff(controller);
  right.update(1 / 60, { ...ahead, steer: 1 });
  assert.ok(Math.abs(right.yaw) < 0.003);
  right.reset(pad); takeoff(right);
  advance(left, 2, { ...ahead, steer: -1 });
  advance(right, 2, { ...ahead, steer: 1 });
  assert.ok(Math.abs(left.yaw + right.yaw) < 1e-9);
  assert.ok(right.position.x > pad.x && left.position.x < pad.x);
  advance(reverse, 3, { ...ahead, throttle: -1 });
  assert.ok(reverse.position.z > pad.z && reverse.speed <= 5);
});

test('outside the helipad descent stops at a safe altitude instead of landing on scenery', () => {
  const controller = helicopter(); takeoff(controller);
  advance(controller, 3, ahead);
  advance(controller, 1, { ...idle, brake: true });
  advance(controller, 8, down);
  assert.equal(controller.position.y, controller.minimumFlightAltitude);
  assert.equal(controller.landed, false);
  assert.equal(controller.canSwitch, false);
});

test('a slow manual descent over the helipad lands without a position jump and permits switching', () => {
  const controller = helicopter(); takeoff(controller);
  for (let frame = 0; frame < 600 && !controller.landed; frame++) {
    const before = controller.position.clone();
    controller.update(1 / 60, down);
    assert.ok(controller.position.distanceTo(before) < 0.1, 'landing moves smoothly');
  }
  assert.equal(controller.landed, true);
  assert.equal(controller.canSwitch, true);
  assert.ok(controller.position.distanceTo(pad) < 0.00001);
  assert.equal(controller.velocity.length(), 0);
});

test('landing availability requires both the roof column and low horizontal speed', () => {
  const controller = helicopter(); takeoff(controller);
  controller.velocity.z = -2;
  assert.equal(controller.landingAvailable, false);
  controller.velocity.z = 0;
  assert.equal(controller.landingAvailable, true);
  controller.position.x += 4.1;
  assert.equal(controller.landingAvailable, false);
});

test('landing near the pad edge gently centers the skids before touchdown', () => {
  const controller = helicopter(); takeoff(controller);
  controller.position.x += 3.8;
  for (let frame = 0; frame < 900 && !controller.landed; frame++) {
    const before = controller.position.clone();
    controller.update(1 / 60, down);
    assert.ok(controller.position.distanceTo(before) < 0.1, 'landing assistance must not snap to the pad');
    if (controller.padDistance > 0.35) assert.ok(controller.heightAbovePad >= 0.64, 'skids stay above the parapet until centered');
  }
  assert.equal(controller.landed, true);
  assert.ok(controller.padDistance <= 0.35);
  assert.equal(controller.canSwitch, true);
});

test('hover braking stops climb momentum when altitude input is released', () => {
  const controller = helicopter(); takeoff(controller);
  assert.ok(controller.velocity.y > 5);
  advance(controller, 1.5, { ...idle, brake: true });
  assert.ok(Math.abs(controller.velocity.y) < 0.04);
  assert.equal(controller.landed, false);
});

test('flight has a ceiling and map bounds, and reset returns all motion to the helipad', () => {
  const controller = helicopter(); advance(controller, 15, up);
  assert.equal(controller.position.y, 55);
  advance(controller, 25, ahead);
  assert.equal(controller.position.z, -82);
  assert.ok(controller.position.toArray().every(Number.isFinite));
  controller.reset(pad);
  assert.deepEqual(controller.position.toArray(), pad.toArray());
  assert.deepEqual(controller.velocity.toArray(), [0, 0, 0]);
  assert.deepEqual(controller.forward.toArray(), [0, 0, -1]);
  assert.equal(controller.yaw, 0);
  assert.equal(controller.turnVelocity, 0);
  assert.equal(controller.canSwitch, true);
});

test('30Hz and120Hz flight paths stay closely aligned', () => {
  const slow = helicopter(); const fast = helicopter();
  advance(slow, 2.5, up, 30); advance(fast, 2.5, up, 120);
  advance(slow, 3, { ...ahead, steer: 0.3 }, 30);
  advance(fast, 3, { ...ahead, steer: 0.3 }, 120);
  assert.ok(slow.position.distanceTo(fast.position) < 0.03);
  assert.ok(Math.abs(slow.yaw - fast.yaw) < 0.001);
});

test('the supplied helicopter has two animated rotor groups and its fuselage remains fixed', async () => {
  const buffer = await readFile(new URL('../models/odz-20a_universal_helicopter_20a.glb', import.meta.url));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const wrapper = new Group(); wrapper.add(gltf.scene);
  const loader = { loadModel: async () => ({ object: wrapper, animations: [], fallback: false }) } as unknown as AssetLoader;
  const rendered = new Helicopter(); rendered.controller.reset(pad); await rendered.load(loader);
  let main: Group | undefined; let tail: Group | undefined;
  gltf.scene.traverse(node => { if (/278$/.test(node.name)) main = node as Group; if (/279$/.test(node.name)) tail = node as Group; });
  assert.ok(main && tail, 'actual GLB rotor groups must remain identifiable');
  const mainBefore = main.quaternion.clone(); const tailBefore = tail.quaternion.clone();
  const bodyBefore = gltf.scene.quaternion.clone();
  rendered.update(1, 1 / 60, true);
  assert.ok(!main.quaternion.equals(mainBefore) && !tail.quaternion.equals(tailBefore));
  assert.ok(gltf.scene.quaternion.equals(bodyBefore), 'rotor spin cannot rotate the fuselage');
  assert.ok(new Box3().setFromObject(wrapper).getSize(new Vector3()).toArray().every(Number.isFinite));
});
