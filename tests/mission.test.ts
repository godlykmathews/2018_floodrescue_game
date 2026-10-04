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

function assertSearchReset(boat: Boat, survivor: Survivor, mission: RescueMission) {
  assert.equal(mission.phase, 'search');
  assert.equal(mission.rescued, false);
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
  assert.equal(mission.getHUD().objective, 'Rescue the stranded survivor');
});

test('distance, safe speed, and bow alignment guard the rescue interaction', () => {
  const scenarios = [
    { name: 'far', distance: 20, speed: 0, heading: -1, message: 'FIND THE STRANDED SURVIVOR' },
    { name: 'ahead', distance: 9, speed: 0, heading: -1, message: 'SURVIVOR AHEAD' },
    { name: 'fast', distance: 4, speed: 3, heading: -1, message: 'TOO FAST — SLOW DOWN' },
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
  assert.equal(mission.rescued, false);
  assert.equal(mission.interact(), false, 'holding E must not restart an active boarding animation');
  assert.equal(mission.getHUD().ready, false);
  assert.equal(mission.getHUD().message, 'HELPING SURVIVOR ABOARD…');
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
  assert.ok(Math.abs(midway.z - (start.z + seat.z) / 2) < 0.01, 'midpoint should be halfway across the transfer');
  assert.ok(midway.y > (start.y + seat.y) / 2 + 0.4, 'the transfer should follow its gentle raised arc');
  assert.equal(mission.phase, 'boarding');
  assert.equal(boat.controller.locked, true);
  mission.update(1.05);
  assert.equal(mission.phase, 'return');
  assert.equal(survivor.character.parent, boat.seat);
  assert.deepEqual(survivor.character.position.toArray(), [0, 0, 0]);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.rescued, true);
  assert.equal(mission.target, mission.campPosition);
  assert.equal(mission.getHUD().objective, 'Go to the relief camp');
  assert.equal(mission.getHUD().message, 'SURVIVOR RESCUED');
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
  assert.equal(mission.getHUD().message, 'GO TO THE RELIEF CAMP');
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
});

test('relief delivery requires both a nearby boat and a safe total speed', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  mission.interact();
  finishBoarding(mission);
  boat.controller.position.copy(mission.campPosition).add(new Vector3(6, 0, 0));
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'a stopped boat outside the landing zone must not complete');
  assert.equal(boat.controller.locked, false);
  boat.controller.position.copy(mission.campPosition);
  boat.controller.velocity.set(2, 0, 0);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'lateral speed must also prevent an unsafe delivery');
  assert.equal(mission.getHUD().message, 'TOO FAST — SLOW DOWN');
  assert.equal(mission.getHUD().completed, false);
  boat.controller.velocity.set(0, 0, -2);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'return', 'forward speed must prevent an unsafe delivery');
});

test('safe arrival completes the actual mission sequence and stops further movement', () => {
  const { boat, survivor, mission } = createMission();
  approach(boat, survivor);
  assert.equal(mission.interact(), true);
  finishBoarding(mission);
  assert.equal(mission.phase, 'return');
  boat.controller.position.copy(mission.campPosition).add(new Vector3(2, 0, 1));
  boat.controller.velocity.set(0, 0, -0.8);
  mission.update(1 / 60);
  assert.equal(mission.phase, 'complete');
  assert.equal(mission.rescued, true);
  assert.equal(mission.getHUD().completed, true);
  assert.equal(mission.getHUD().message, 'MISSION COMPLETE');
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  assert.equal(survivor.character.parent, boat.seat);
  assert.equal(mission.interact(), false);
  const finishPosition = boat.controller.position.clone();
  boat.controller.update(0.5, { throttle: 1, steer: 1, brake: false });
  mission.update(2);
  assert.ok(boat.controller.position.equals(finishPosition));
  assert.equal(mission.phase, 'complete');
});

test('restart from mission complete clears the result and allows a second full mission', () => {
  const { boat, survivor, mission } = createMission();
  for (let run = 0; run < 2; run++) {
    approach(boat, survivor);
    assert.equal(mission.interact(), true);
    finishBoarding(mission);
    boat.controller.position.copy(mission.campPosition);
    mission.update(1 / 60);
    assert.equal(mission.phase, 'complete');
    mission.reset();
    assertSearchReset(boat, survivor, mission);
    assert.equal(boat.seat.children.length, 0);
  }
});
