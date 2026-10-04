import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { BoatController } from '../src/game/BoatController.ts';
import { HelicopterController } from '../src/game/HelicopterController.ts';
import { VehicleTransfer } from '../src/game/VehicleTransfer.ts';

function setup() {
  const boat = new BoatController(), helicopter = new HelicopterController();
  const dock = new Vector3(-29, 0, 39), roof = new Vector3(-43, 10.05, 34.28);
  helicopter.reset(roof); boat.position.copy(dock);
  return { boat, helicopter, dock, transfer: new VehicleTransfer(boat, helicopter, dock) };
}

test('transfer requires an empty, slow boat at the dock and an idle mission', () => {
  const { boat, transfer } = setup();
  assert.equal(transfer.request(1, true), false);
  assert.equal(transfer.condition(3, true), 'passengers');
  assert.equal(transfer.request(0, false), false);
  boat.velocity.z = 1.25;
  assert.equal(transfer.request(0, true), false);
  boat.velocity.set(0, 0, 0); boat.position.x += 3.1;
  assert.equal(transfer.condition(0, true), 'away');
  assert.equal(transfer.request(0, true), false);
  assert.equal(transfer.active, 'boat'); assert.equal(boat.locked, false);
});

test('switch locks input for the full animation, rejects duplicate E, and parks the boat', () => {
  const { boat, transfer } = setup();
  boat.yaw = .7; boat.velocity.z = .8;
  const position = boat.position.clone();
  assert.equal(transfer.request(0, true), true);
  assert.equal(boat.speed, 0); assert.equal(boat.locked, true);
  assert.equal(transfer.request(0, true), false);
  assert.equal(transfer.update(1), false); assert.equal(transfer.active, 'boat');
  boat.update(1, { throttle: 1, steer: 1, brake: false }, [], new Vector3(3, 0, 1));
  assert.deepEqual(boat.position, position); assert.equal(boat.yaw, .7);
  assert.equal(transfer.update(1), true); assert.equal(transfer.active, 'helicopter');
  assert.equal(boat.locked, true); assert.equal(transfer.switching, false);
  assert.equal(transfer.update(2), false);
});

test('return requires rooftop touchdown and restores the same boat without resetting it', () => {
  const { boat, helicopter, transfer } = setup();
  const position = boat.position.clone(); boat.yaw = -1.1;
  transfer.request(0, true); transfer.update(2);
  helicopter.update(.1, { throttle: 0, steer: 0, lift: 1, brake: false });
  assert.equal(transfer.condition(0, true), 'airborne');
  assert.equal(transfer.request(0, true), false);
  for (let i = 0; i < 100; i++) helicopter.update(.05, { throttle: 0, steer: 0, lift: -1, brake: true });
  assert.equal(helicopter.canSwitch, true);
  assert.equal(transfer.request(0, true), true);
  assert.equal(transfer.update(2), true);
  assert.equal(transfer.active, 'boat'); assert.equal(boat.locked, false);
  assert.deepEqual(boat.position, position); assert.equal(boat.yaw, -1.1);
});

test('reset cancels either transfer direction and releases the boat', () => {
  for (const returning of [false, true]) {
    const { boat, transfer } = setup();
    transfer.request(0, true);
    if (returning) { transfer.update(2); transfer.request(0, true); }
    transfer.update(.7); transfer.reset();
    assert.equal(transfer.active, 'boat'); assert.equal(transfer.destination, null);
    assert.equal(transfer.progress, 0); assert.equal(boat.locked, false);
    assert.equal(transfer.update(100), false);
  }
});
