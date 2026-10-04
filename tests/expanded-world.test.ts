import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { Boat } from '../src/game/Boat.ts';
import { BoatController } from '../src/game/BoatController.ts';
import { LEVELS } from '../src/game/LevelManager.ts';
import { RescueMission, getRescueCondition } from '../src/game/RescueMission.ts';
import { SurvivorManager } from '../src/game/SurvivorManager.ts';
import { sampleFloodHeight } from '../src/game/Water.ts';

test('each level includes women in its actual rescuable population', () => {
  const manager = new SurvivorManager();
  for (const [index, level] of LEVELS.entries()) {
    manager.configure(level.counts);
    assert.equal(manager.active.filter(person => person.options.model === 'woman').length, [1, 3, 4][index]);
    assert.equal(manager.active.length, level.survivors, 'varied models must not change mission counts');
    assert.ok(manager.active.every(person => person.state === 'WAITING' && person.root.visible));
  }
});

test('the enlarged movement boundary permits exploration beyond the original village in every direction', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const boat = new BoatController();
    boat.position.set(0, 0, 0);
    boat.yaw = yaw;
    for (let frame = 0; frame < 20 * 60; frame++) {
      boat.update(1 / 60, { throttle: 1, steer: 0, brake: false });
      assert.ok(Math.abs(boat.position.x) <= 88 && Math.abs(boat.position.z) <= 88);
    }
    assert.ok(Math.max(Math.abs(boat.position.x), Math.abs(boat.position.z)) > 87,
      'the old 57-metre boundary must no longer block the outer neighbourhoods');
    assert.equal(boat.position.y, 0, 'stronger visual waves must not change planar boat physics');
  }
});

test('the anchored log keeps a collision-free safe rescue approach', () => {
  const manager = new SurvivorManager();
  manager.configure(LEVELS[2].counts);
  const site = manager.sites.find(item => item.id === 'B')!;
  const boat = new BoatController();
  boat.position.copy(site.docking);
  boat.yaw = site.yaw;
  const before = boat.position.clone();
  boat.update(1 / 60, { throttle: 0, steer: 0, brake: true }, manager.colliders);
  assert.ok(boat.position.equals(before), 'the log must not push the boat out of the designated approach');
  for (const person of site.people) assert.equal(getRescueCondition(boat, person.position), 'ready');
});

test('log survivors float while waiting, leave the log visibly, and regain their grip on restart', () => {
  const manager = new SurvivorManager();
  manager.configure(LEVELS[1].counts);
  const boat = new Boat();
  const mission = new RescueMission(boat, manager.active);
  const site = manager.sites.find(item => item.id === 'B')!;
  const person = site.people[0];
  let grip = 1;
  const setClinging = person.actor.setClinging.bind(person.actor);
  person.actor.setClinging = amount => { grip = amount; setClinging(amount); };
  const anchor = manager.rescueLog.position.clone();
  manager.update(8);
  const offset = person.character.position.y - person.position.y;
  assert.ok(Math.abs(offset) > 0.001, 'waiting survivors should visibly follow the water');
  assert.ok(Math.abs(offset - (manager.rescueLog.position.y + 0.18)) < 1e-10,
    'the person and the log need the same vertical motion');
  assert.equal(manager.rescueLog.position.x, anchor.x);
  assert.equal(manager.rescueLog.position.z, anchor.z);
  boat.controller.position.copy(site.docking);
  boat.update(8, sampleFloodHeight(site.docking.x, site.docking.z, 8));
  const from = person.character.position.clone();
  assert.equal(mission.nearestSurvivor, person);
  assert.equal(mission.interact(), true);
  assert.ok(person.character.position.equals(from), 'starting rescue must not teleport the swimmer');
  mission.update(0.4);
  assert.equal(person.state, 'BOARDING');
  assert.ok(grip < 1 && grip > 0, 'the survivor should release the log during the climb');
  assert.ok(person.character.position.distanceTo(from) > 0.05);
  const climbing = person.character.position.clone();
  manager.update(25);
  assert.ok(person.character.position.equals(climbing), 'water bobbing must not snap a boarding person back to the log');
  mission.update(1.6);
  assert.equal(person.state, 'PASSENGER');
  assert.equal(grip, 0);
  assert.equal(person.character.parent, mission.passengers.seatOf(person));
  const seated = person.character.position.clone();
  manager.update(40);
  assert.ok(person.character.position.equals(seated), 'seated passengers must remain relative to their boat seat');
  mission.reset();
  assert.equal(person.state, 'WAITING');
  assert.equal(person.character.parent, person.root);
  assert.ok(person.character.position.equals(person.position));
  assert.equal(grip, 1);
  assert.equal(mission.passengers.count, 0);
});

test('wave following moves the complete boat crew while leaving controller and seat offsets untouched', () => {
  const boat = new Boat();
  const controllerPosition = boat.controller.position.clone();
  const seatOffsets = boat.seats.map(seat => seat.position.clone());
  const driverOffset = boat.driver.root.position.clone();
  boat.update(3, 0);
  const crewBefore = [boat.driver.root, ...boat.seats].map(object => object.getWorldPosition(new Vector3()));
  boat.update(3, 0.17);
  [boat.driver.root, ...boat.seats].forEach((object, index) => {
    const after = object.getWorldPosition(new Vector3());
    assert.ok(Math.abs(after.y - crewBefore[index].y - 0.17) < 1e-8);
    assert.ok(Math.abs(after.x - crewBefore[index].x) < 1e-8 && Math.abs(after.z - crewBefore[index].z) < 1e-8);
  });
  assert.ok(boat.controller.position.equals(controllerPosition));
  boat.seats.forEach((seat, index) => assert.ok(seat.position.equals(seatOffsets[index])));
  assert.ok(boat.driver.root.position.equals(driverOffset));
});
