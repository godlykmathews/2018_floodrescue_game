import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { Boat } from '../src/game/Boat.ts';
import { Survivor } from '../src/game/Survivor.ts';
import { RescueMission, getRescueCondition } from '../src/game/RescueMission.ts';

function createMission() {
  // Constructors are intentionally usable without a browser or network asset loads.
  const boat = new Boat();
  const survivor = new Survivor();
  const mission = new RescueMission(boat, survivor);
  return { boat, survivor, mission };
}

function approach(boat: Boat, survivor: Survivor) {
  boat.controller.position.set(survivor.position.x, 0, survivor.position.z + 4);
  boat.controller.forward.set(0, 0, -1);
  boat.controller.yaw = 0;
  boat.controller.velocity.set(0, 0, 0);
  boat.update(0);
}

function finishBoarding(mission: RescueMission) {
  for (let i = 0; i < 132; i++) mission.update(1 / 60);
}

function arriveAtCamp(boat: Boat, mission: RescueMission) {
  boat.controller.position.copy(mission.campPosition);
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = Math.PI;
  boat.controller.forward.set(0, 0, 1);
  boat.update(0);
}

function assertSearchReset(boat: Boat, survivor: Survivor, mission: RescueMission) {
  assert.equal(mission.phase, 'search');
  assert.equal(mission.rescued, false);
  assert.equal(mission.passengers.count, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.trips, 0);
  assert.equal(mission.missionTime, 0);
  assert.equal(mission.integrity, 100);
  assert.equal(survivor.state, 'WAITING');
  assert.equal(mission.target, survivor.position);
  assert.equal(boat.controller.locked, false);
  assert.deepEqual(boat.controller.position.toArray(), [0, 0, 27]);
  assert.equal(boat.controller.speed, 0);
  assert.equal(survivor.character.parent, survivor.root);
  assert.ok(survivor.character.position.equals(survivor.position));
  assert.deepEqual(survivor.character.rotation.toArray().slice(0, 3), [0, 0, 0]);
  assert.deepEqual(survivor.character.scale.toArray(), [1, 1, 1]);
  assert.equal(mission.getHUD().completed, false);
}

test('a new mission points to the stranded survivor and cannot rescue from the start', () => {
  const { survivor, mission } = createMission();
  assert.equal(mission.phase, 'search');
  assert.equal(mission.rescued, false);
  assert.equal(mission.target, survivor.position);
  assert.equal(mission.distance, 49);
  assert.equal(mission.interact(), false);
  assert.equal(mission.getHUD().objective, 'Rescue remaining survivors');
  assert.equal(mission.getHUD().message, '', 'distant survivors should not produce persistent instructions');
});

test('distance, safe speed, and bow alignment guard the rescue interaction', () => {
  const scenarios = [
    { name: 'far', distance: 20, speed: 0, heading: -1, message: '' },
    { name: 'ahead', distance: 9, speed: 0, heading: -1, message: '' },
    { name: 'fast', distance: 4, speed: 3, heading: -1, message: 'SLOW DOWN' },
    { name: 'align', distance: 4, speed: 0, heading: 1, message: 'ALIGN THE BOAT' },
  ] as const;
  for (const scenario of scenarios) {
    const { boat, survivor, mission } = createMission();
    approach(boat, survivor);
    boat.controller.position.z = survivor.position.z + scenario.distance;
    boat.controller.velocity.set(0, 0, -scenario.speed);
    boat.controller.forward.set(0, 0, scenario.heading);
    assert.equal(getRescueCondition(boat.controller, survivor.position), scenario.name);
    assert.equal(mission.getHUD().message, scenario.message);
    assert.equal(mission.getHUD().ready, false);
    assert.equal(mission.interact(), false, `${scenario.name} approach must be rejected`);
    assert.equal(mission.phase, 'search');
    assert.equal(boat.controller.locked, false);
    assert.equal(survivor.character.parent, survivor.root);
  }
});

test('safe speed includes lateral drift, so sideways sliding cannot bypass the guard', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  boat.controller.velocity.set(2, 0, 0);
  assert.equal(getRescueCondition(boat.controller, survivor.position), 'fast');
  assert.equal(mission.interact(), false);
});

test('valid interaction starts boarding once, locks movement, and clears residual momentum', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  boat.controller.velocity.set(0, 0, -0.7);
  assert.equal(mission.getHUD().ready, true);
  assert.equal(mission.interact(), true);
  assert.equal(mission.phase, 'boarding');
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  assert.equal(mission.safeCount, 0, 'boarding must not count as delivery');
  assert.equal(survivor.state, 'BOARDING');
  assert.equal(mission.passengers.count, 1, 'the seat is reserved for the person boarding');
  assert.equal(mission.interact(), false, 'holding E must not restart an active boarding animation');
  assert.equal(mission.getHUD().ready, false);
  assert.equal(mission.getHUD().message, 'BOARDING');
  const position = boat.controller.position.clone();
  boat.controller.update(0.2, { throttle: 1, steer: 1, brake: false });
  assert.ok(boat.controller.position.equals(position));
});

test('boarding moves smoothly from the platform to the boat before parenting to the seat', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  const start = survivor.character.getWorldPosition(new Vector3());
  const seat = boat.seat.getWorldPosition(new Vector3());
  assert.equal(mission.interact(), true);
  mission.update(0.1);
  const early = survivor.character.getWorldPosition(new Vector3());
  assert.ok(early.distanceTo(start) > 0, 'the animation must move the survivor');
  assert.ok(early.distanceTo(start) < start.distanceTo(seat) * 0.15, 'boarding must not teleport on the first frame');
  assert.equal(survivor.character.parent, survivor.root);
  mission.update(0.95);
  const midway = survivor.character.getWorldPosition(new Vector3());
  assert.ok(midway.distanceTo(start) > early.distanceTo(start), 'the survivor must progress toward the boat');
  assert.ok(midway.distanceTo(seat) > 0.1, 'boarding must remain visible before the final seat attachment');
  assert.ok(midway.toArray().every(Number.isFinite));
  assert.equal(mission.phase, 'boarding');
  assert.equal(boat.controller.locked, true);
  mission.update(1.05);
  assert.equal(mission.phase, 'return');
  assert.equal(survivor.character.parent, boat.seat);
  assert.equal(survivor.state, 'PASSENGER');
  assert.deepEqual(survivor.character.position.toArray(), [0, 0, 0]);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.rescued, true);
  assert.equal(mission.target, mission.campPosition);
  assert.equal(mission.getHUD().objective, 'Deliver passengers');
  assert.equal(mission.getHUD().message, '');
});

test('the rescued passenger travels with the boat and E cannot board them twice', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  mission.interact();
  finishBoarding(mission);
  boat.controller.position.set(8, 0, 3);
  boat.controller.yaw = 0.8;
  boat.update(1);
  const passenger = survivor.character.getWorldPosition(new Vector3());
  const seat = boat.seat.getWorldPosition(new Vector3());
  assert.ok(passenger.distanceTo(seat) < 1e-9);
  assert.equal(mission.interact(), false);
  mission.update(5.1);
  assert.equal(mission.getHUD().objective, 'Deliver passengers');
  assert.equal(mission.getHUD().message, '');
});

test('restart midway through boarding restores the survivor and permits a fresh rescue', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  mission.interact();
  mission.update(0.8);
  mission.reset();
  assertSearchReset(boat, survivor, mission);
  approach(boat, survivor);
  assert.equal(mission.interact(), true);
  finishBoarding(mission);
  assert.equal(mission.phase, 'return');
  assert.equal(survivor.character.parent, boat.seat);
});

test('restart after rescue removes the passenger from the seat and restores all mission state', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  mission.interact();
  finishBoarding(mission);
  assert.equal(survivor.character.parent, boat.seat);
  mission.reset();
  assertSearchReset(boat, survivor, mission);
  assert.equal(boat.seat.children.length, 0);
  mission.update(1);
  assert.equal(mission.phase, 'search', 'an old boarding timer must not transition a restarted mission');
});

test('visiting the relief camp before rescuing anyone cannot complete the mission', () => {
  const { boat, mission } = createMission();
  boat.controller.position.copy(mission.campPosition);
  mission.update(1);
  assert.equal(mission.phase, 'search');
  assert.equal(mission.rescued, false);
  assert.equal(mission.getHUD().completed, false);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.interact(), false, 'E at an empty camp must not create an unloading trip');
  assert.equal(mission.trips, 0);
});

test('relief delivery requires both a nearby boat and a safe total speed', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  mission.interact();
  finishBoarding(mission);
  boat.controller.position.copy(mission.campPosition).add(new Vector3(6, 0, 0));
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'a stopped boat outside the landing zone must not complete');
  assert.equal(mission.interact(), false);
  assert.equal(boat.controller.locked, false);
  boat.controller.position.copy(mission.campPosition);
  boat.controller.velocity.set(2, 0, 0);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'lateral speed must also prevent an unsafe delivery');
  assert.equal(mission.getHUD().message, 'SLOW DOWN');
  assert.equal(mission.interact(), false);
  assert.equal(mission.getHUD().completed, false);
  boat.controller.velocity.set(0, 0, -2);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'forward speed must prevent an unsafe delivery');
  assert.equal(mission.interact(), false);
});

test('safe arrival waits for E, then visibly unloads before completing and stopping movement', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  assert.equal(mission.interact(), true);
  finishBoarding(mission);
  assert.equal(mission.phase, 'return');
  arriveAtCamp(boat, mission);
  boat.controller.position.add(new Vector3(2, 0, 1));
  boat.controller.velocity.set(0, 0, -0.8);
  boat.update(0);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'arrival alone must not unload or complete');
  assert.equal(survivor.state, 'PASSENGER');
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.getHUD().message, '[ E ]  DISEMBARK PASSENGERS');
  assert.equal(mission.getHUD().ready, true);
  const seatedPosition = survivor.character.getWorldPosition(new Vector3());
  assert.equal(mission.interact(), true);
  assert.equal(mission.phase, 'unloading');
  assert.equal(survivor.state, 'DISEMBARKING');
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  assert.equal(mission.interact(), false, 'repeated E must not restart unloading');
  assert.ok(survivor.character.getWorldPosition(new Vector3()).distanceTo(seatedPosition) < 1e-9,
    'leaving the seat parent must preserve the world position');
  mission.update(0.1);
  const early = survivor.character.getWorldPosition(new Vector3());
  assert.ok(early.distanceTo(seatedPosition) > 0);
  assert.ok(early.distanceTo(seatedPosition) < 0.5, 'the first unloading frames must not teleport to camp');
  assert.equal(mission.safeCount, 0);
  mission.update(1.1);
  assert.equal(mission.phase, 'unloading');
  assert.equal(mission.safeCount, 0, 'a survivor in transit is not safe yet');
  mission.update(1);
  assert.equal(mission.phase, 'complete');
  assert.equal(mission.rescued, true);
  assert.equal(mission.getHUD().completed, true);
  assert.equal(mission.getHUD().message, 'MISSION COMPLETE');
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  assert.equal(survivor.state, 'SAFE');
  assert.equal(survivor.character.parent, survivor.root);
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.seat.children.length, 0);
  assert.equal(mission.safeCount, 1);
  assert.equal(mission.trips, 1);
  const safePosition = survivor.character.getWorldPosition(new Vector3());
  assert.ok(safePosition.x >= 19 && safePosition.x <= 29);
  assert.ok(safePosition.z >= 22.5 && safePosition.z <= 27.5, 'the survivor must stay on the camp deck');
  assert.equal(mission.interact(), false);
  const finishPosition = boat.controller.position.clone();
  boat.controller.update(0.5, { throttle: 1, steer: 1, brake: false });
  mission.update(2);
  assert.ok(boat.controller.position.equals(finishPosition));
  assert.ok(survivor.character.getWorldPosition(new Vector3()).equals(safePosition));
  assert.equal(mission.phase, 'complete');
});

test('restart from mission complete clears the result and allows a second full mission', () => {
  const { boat, survivor, mission } = createMission();
  for (let run = 0; run < 2; run++) {
    approach(boat, survivor);
    assert.equal(mission.interact(), true);
    finishBoarding(mission);
    arriveAtCamp(boat, mission);
    assert.equal(mission.interact(), true);
    finishBoarding(mission);
    assert.equal(mission.phase, 'complete');
    mission.reset();
    assertSearchReset(boat, survivor, mission);
    assert.equal(boat.seat.children.length, 0);
  }
});
