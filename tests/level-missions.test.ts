import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { Boat } from '../src/game/Boat.ts';
import { LEVELS } from '../src/game/LevelManager.ts';
import { RescueMission } from '../src/game/RescueMission.ts';
import { Survivor } from '../src/game/Survivor.ts';
import { SurvivorManager } from '../src/game/SurvivorManager.ts';

function fixture(levelIndex = 2) {
  // Exercise the real level pool and mission classes without WebGL or GLB fetches.
  const boat = new Boat();
  const manager = new SurvivorManager();
  manager.configure(LEVELS[levelIndex].counts);
  const mission = new RescueMission(boat, manager.active);
  return { boat, manager, mission };
}

function approach(boat: Boat, person: Survivor) {
  // Terraces A/B face the road; the roof at C is reached from its eastern edge.
  const east = person.locationId === 'C';
  boat.controller.position.set(person.position.x + (east ? 4 : 0), 0, person.position.z + (east ? 0 : 4));
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = east ? Math.PI / 2 : 0;
  boat.controller.forward.set(east ? -1 : 0, 0, east ? 0 : -1);
  boat.update(0);
}

function board(boat: Boat, mission: RescueMission, person: Survivor) {
  approach(boat, person);
  assert.equal(mission.nearestSurvivor, person);
  assert.equal(mission.interact(), true);
  assert.equal(person.state, 'BOARDING');
  mission.update(1);
  assert.equal(person.state, 'BOARDING', 'the passenger must remain in the visible boarding sequence for two seconds');
  assert.equal(person.character.parent, person.root);
  mission.update(1);
  assert.equal(person.state, 'PASSENGER');
  assert.equal(person.character.parent, mission.passengers.seatOf(person));
}

function arrive(boat: Boat, mission: RescueMission) {
  boat.controller.position.copy(mission.campPosition);
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = Math.PI;
  boat.controller.forward.set(0, 0, 1);
  boat.update(0);
}

function unloadThree(boat: Boat, mission: RescueMission) {
  arrive(boat, mission);
  const group = [...mission.passengers.occupants];
  assert.equal(group.length, 3);
  const safeBefore = mission.safeCount;
  const tripsBefore = mission.trips;
  assert.equal(mission.interact(), true);
  for (let i = 0; i < group.length; i++) {
    assert.equal(group[i].state, 'DISEMBARKING');
    assert.equal(group.filter(person => person.state === 'DISEMBARKING').length, 1);
    assert.ok(group.slice(i + 1).every(person => person.state === 'PASSENGER'));
    assert.equal(boat.controller.locked, true);
    const from = group[i].character.getWorldPosition(new Vector3());
    mission.update(1);
    assert.equal(group[i].state, 'DISEMBARKING');
    assert.ok(group[i].character.getWorldPosition(new Vector3()).distanceTo(from) > 0.1);
    assert.equal(mission.safeCount, safeBefore + i, 'people in transit must not count as delivered');
    assert.equal(mission.trips, tripsBefore, 'the trip ends only after all three passengers leave');
    mission.update(1);
    assert.equal(group[i].state, 'SAFE');
    assert.equal(group[i].character.parent, group[i].root);
    assert.equal(mission.safeCount, safeBefore + i + 1);
  }
  assert.equal(mission.passengers.count, 0);
  assert.equal(mission.trips, tripsBefore + 1);
  for (const seat of boat.seats) assert.equal(seat.children.length, 0);
}

test('the real survivor pool applies each level population and hides every inactive character', () => {
  const manager = new SurvivorManager();
  const expectedIds = [
    ['A-1', 'A-2', 'A-3'],
    ['A-1', 'A-2', 'B-1', 'C-1', 'C-2', 'C-3'],
    ['A-1', 'A-2', 'A-3', 'B-1', 'B-2', 'B-3', 'C-1', 'C-2', 'C-3'],
  ];
  for (const [index, level] of LEVELS.entries()) {
    manager.configure(level.counts);
    assert.deepEqual(manager.active.map(person => person.id), expectedIds[index]);
    assert.equal(manager.active.length, level.survivors);
    assert.equal(new Set(manager.active.map(person => person.id)).size, level.survivors);
    assert.deepEqual(manager.sites.map(site => site.people.filter(person => person.root.visible).length), [...level.counts]);
    assert.equal(manager.all.length, 9, 'changing levels must reuse the nine-person pool');
    for (const person of manager.all) {
      assert.equal(person.root.visible, expectedIds[index].includes(person.id));
      assert.equal(person.state, 'WAITING');
      assert.equal(person.character.parent, person.root);
      assert.ok(person.character.position.equals(person.position));
    }
  }
});

test('Level 3 delivers all nine people through three complete two-second boarding and six-second unloading trips', () => {
  const { boat, manager, mission } = fixture();
  const driver = boat.driver.root;
  const driverOffset = driver.position.clone();
  let rescueEvents = 0, deliveryEvents = 0;
  mission.onRescue = () => rescueEvents++;
  mission.onDelivered = () => deliveryEvents++;
  const deliveredPositions = new Map<string, Vector3>();
  for (let trip = 0; trip < 3; trip++) {
    const group = manager.active.slice(trip * 3, trip * 3 + 3);
    for (const person of group) board(boat, mission, person);
    assert.equal(mission.passengers.count, 3);
    assert.equal(mission.getHUD().completed, false);
    assert.equal(mission.safeCount, trip * 3);
    assert.equal(mission.remaining, 9 - trip * 3, 'aboard survivors are not yet safe');
    for (const [id, position] of deliveredPositions) {
      const person = manager.active.find(item => item.id === id)!;
      assert.equal(person.state, 'SAFE');
      assert.ok(person.character.getWorldPosition(new Vector3()).equals(position), 'earlier groups stay visible at camp');
    }
    if (trip < 2) {
      approach(boat, manager.active[(trip + 1) * 3]);
      assert.equal(mission.interact(), false, 'another site must not admit a fourth passenger');
      assert.equal(mission.getHUD().message, 'BOAT FULL — RETURN TO CAMP');
    }
    unloadThree(boat, mission);
    for (const person of group) deliveredPositions.set(person.id, person.character.getWorldPosition(new Vector3()));
    assert.equal(mission.phase, trip === 2 ? 'complete' : 'search');
    assert.equal(boat.controller.locked, trip === 2);
    assert.equal(driver.parent, boat.visual);
    assert.ok(driver.position.equals(driverOffset));
  }
  assert.equal(rescueEvents, 9);
  assert.equal(deliveryEvents, 9);
  assert.equal(mission.trips, 3);
  assert.equal(mission.safeCount, 9);
  assert.equal(mission.remaining, 0);
  assert.equal(mission.missionTime, 36, 'nine two-second boarding sequences plus three six-second unloads');
  assert.equal(mission.getHUD().total, 9);
  assert.equal(mission.getHUD().completed, true);
  assert.ok(manager.active.every(person => person.root.visible && person.state === 'SAFE'));
  assert.equal(new Set([...deliveredPositions.values()].map(position => position.toArray().join(','))).size, 9, 'each person needs a distinct camp position');
  assert.equal(mission.interact(), false);
  mission.update(120);
  assert.equal(mission.missionTime, 36, 'completion freezes the final mission time');
  assert.equal(mission.safeCount, 9);
  assert.equal(deliveryEvents, 9);
});

test('zero integrity freezes a mixed Level 3 mission and restart restores all nine people without removing the driver', () => {
  const { boat, manager, mission } = fixture();
  const driver = boat.driver.root;
  const driverOffset = driver.position.clone();
  for (const person of manager.active.slice(0, 3)) board(boat, mission, person);
  unloadThree(boat, mission);
  board(boat, mission, manager.active[3]);
  approach(boat, manager.active[4]);
  assert.equal(mission.interact(), true);
  mission.update(0.8);
  assert.ok(manager.active.some(person => person.state === 'SAFE'));
  assert.ok(manager.active.some(person => person.state === 'PASSENGER'));
  assert.ok(manager.active.some(person => person.state === 'BOARDING'));
  assert.ok(manager.active.some(person => person.state === 'WAITING'));
  mission.damage(150);
  assert.equal(mission.integrity, 0);
  assert.equal(mission.phase, 'failed');
  assert.equal(mission.getHUD().failed, true);
  assert.equal(mission.getHUD().completed, false);
  assert.equal(mission.getHUD().message, 'BOAT DAMAGED');
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  const positions = manager.active.map(person => person.character.getWorldPosition(new Vector3()));
  const states = manager.active.map(person => person.state);
  const boatPosition = boat.controller.position.clone();
  const failedTime = mission.missionTime;
  assert.equal(mission.interact(), false);
  boat.controller.update(0.5, { throttle: 1, steer: 1, brake: false });
  mission.update(10);
  assert.ok(boat.controller.position.equals(boatPosition));
  assert.equal(mission.missionTime, failedTime);
  assert.deepEqual(manager.active.map(person => person.state), states);
  manager.active.forEach((person, index) => assert.ok(person.character.getWorldPosition(new Vector3()).equals(positions[index])));
  mission.reset();
  assert.equal(mission.phase, 'search');
  assert.equal(mission.missionTime, 0);
  assert.equal(mission.integrity, 100);
  assert.equal(mission.trips, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.controller.locked, false);
  assert.equal(driver.parent, boat.visual);
  assert.ok(driver.position.equals(driverOffset));
  for (const seat of boat.seats) assert.equal(seat.children.length, 0);
  for (const person of manager.active) {
    assert.equal(person.state, 'WAITING');
    assert.equal(person.character.parent, person.root);
    assert.ok(person.character.position.equals(person.position));
    assert.equal(person.root.visible, true);
  }
  mission.update(8);
  assert.ok(manager.active.every(person => person.state === 'WAITING'), 'the cancelled boarding must never finish after restart');
  board(boat, mission, manager.active[0]);
  assert.equal(mission.passengers.count, 1, 'the restarted mission must accept new rescue interactions');
});

test('switching from nine to three survivors reclaims seated and delivered actors and hides unused locations', () => {
  const { boat, manager, mission } = fixture();
  const originalPool = [...manager.all];
  for (const person of manager.active.slice(0, 3)) board(boat, mission, person);
  unloadThree(boat, mission);
  for (const person of manager.active.slice(6, 9)) board(boat, mission, person);
  assert.equal(boat.seats.filter(seat => seat.children.length === 1).length, 3);
  manager.configure(LEVELS[0].counts);
  const nextMission = new RescueMission(boat, manager.active);
  assert.deepEqual(manager.all, originalPool, 'changing levels should not construct or duplicate character instances');
  assert.deepEqual(manager.active.map(person => person.id), ['A-1', 'A-2', 'A-3']);
  assert.equal(manager.all.filter(person => person.root.visible).length, 3);
  for (const seat of boat.seats) assert.equal(seat.children.length, 0, 'inactive passengers must leave the boat graph');
  for (const person of manager.all) {
    assert.equal(person.state, 'WAITING');
    assert.equal(person.character.parent, person.root);
    assert.ok(person.character.position.equals(person.position));
    assert.equal(person.root.visible, person.locationId === 'A');
  }
  assert.equal(nextMission.getHUD().total, 3);
  assert.equal(nextMission.waiting.length, 3);
  assert.equal(nextMission.safeCount, 0);
  assert.equal(nextMission.passengers.count, 0);
  assert.equal(nextMission.trips, 0);
  assert.equal(nextMission.missionTime, 0);
  assert.equal(boat.driver.root.parent, boat.visual);
  for (const person of manager.active) board(boat, nextMission, person);
  unloadThree(boat, nextMission);
  assert.equal(nextMission.phase, 'complete');
  assert.equal(nextMission.safeCount, 3);
  assert.equal(nextMission.trips, 1, 'the newly selected first level must complete after one group');
});
