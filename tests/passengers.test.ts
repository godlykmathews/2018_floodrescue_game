import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { Boat } from '../src/game/Boat.ts';
import { PassengerManager } from '../src/game/PassengerManager.ts';
import { RescueMission } from '../src/game/RescueMission.ts';
import { Survivor, type SurvivorState } from '../src/game/Survivor.ts';

function fixture(count = 6) {
  const boat = new Boat();
  const positions: [number, number, number][] = [
    [-1, 1.64, -22], [1, 1.64, -22], [-15, 1.3, 0],
    [23.5, 2.4, -13.2], [23.5, 2.4, -12], [23.5, 2.4, -10.8],
  ];
  const survivors = positions.slice(0, count).map((position, index) => new Survivor({
    id: `person-${index + 1}`, locationId: index < 2 ? 'A' : index === 2 ? 'B' : 'C',
    position, platform: false, rotationY: index * 0.1,
  }));
  return { boat, survivors, mission: new RescueMission(boat, survivors) };
}

function approach(boat: Boat, survivor: Survivor) {
  // Offset along X keeps each target the closest survivor even in a close group.
  boat.controller.position.copy(survivor.position).add(new Vector3(4, -survivor.position.y, 0));
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.forward.set(-1, 0, 0);
  boat.controller.yaw = Math.PI / 2;
  boat.update(0);
}

function finishTransfer(mission: RescueMission) {
  for (let frame = 0; frame < 600 && (mission.phase === 'boarding' || mission.phase === 'unloading'); frame++) {
    mission.update(1 / 60);
  }
  assert.notEqual(mission.phase, 'boarding', 'boarding must finish within the animation budget');
  assert.notEqual(mission.phase, 'unloading', 'a three-person unload must finish within the animation budget');
}

function board(boat: Boat, mission: RescueMission, survivor: Survivor) {
  approach(boat, survivor);
  // Each fixture target may have a closer neighbour; approach from its south when needed.
  if (mission.nearestSurvivor !== survivor) {
    boat.controller.position.set(survivor.position.x, 0, survivor.position.z + 4);
    boat.controller.forward.set(0, 0, -1);
    boat.controller.yaw = 0;
    boat.update(0);
  }
  assert.equal(mission.nearestSurvivor, survivor);
  assert.equal(mission.interact(), true);
  assert.equal(survivor.state, 'BOARDING');
  finishTransfer(mission);
  assert.equal(survivor.state, 'PASSENGER');
}

function camp(boat: Boat, mission: RescueMission) {
  boat.controller.position.copy(mission.campPosition);
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.forward.set(0, 0, 1);
  boat.controller.yaw = Math.PI;
  boat.update(0);
}

function assertReset(boat: Boat, mission: RescueMission, survivors: Survivor[]) {
  assert.equal(mission.phase, 'search');
  assert.equal(mission.passengers.count, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.trips, 0);
  assert.equal(mission.missionTime, 0);
  assert.equal(mission.integrity, 100);
  assert.equal(mission.waiting.length, survivors.length);
  assert.equal(boat.controller.locked, false);
  assert.equal(boat.controller.speed, 0);
  assert.deepEqual(boat.controller.position.toArray(), [0, 0, 27]);
  for (const person of survivors) {
    assert.equal(person.state, 'WAITING');
    assert.equal(person.character.parent, person.root);
    assert.ok(person.character.position.equals(person.position));
    assert.equal(person.character.rotation.y, person.options.rotationY ?? 0);
    assert.deepEqual(person.character.scale.toArray(), [1, 1, 1]);
  }
  for (const seat of boat.seats) assert.equal(seat.children.length, 0);
  assert.equal(boat.driver.root.parent, boat.visual);
}

test('three named passenger seats exclude the permanent driver and reserve capacity during boarding', () => {
  const { boat, survivors, mission } = fixture();
  assert.deepEqual(boat.seats.map(seat => seat.name), ['PASSENGER_SEAT_1', 'PASSENGER_SEAT_2', 'PASSENGER_SEAT_3']);
  assert.equal(mission.passengers.capacity, 3);
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.driver.root.parent, boat.visual);
  const manager = new PassengerManager(boat.seats);
  for (let index = 0; index < 3; index++) {
    assert.equal(manager.reserve(survivors[index]), index);
    assert.equal(manager.seatOf(survivors[index]), boat.seats[index]);
  }
  assert.equal(manager.full, true);
  assert.equal(manager.count, 3);
  assert.equal(manager.reserve(survivors[3]), null);
  assert.equal(manager.seatOf(survivors[3]), null);
  assert.equal(manager.reserve(survivors[0]), null, 'duplicate reservations must not consume another seat');
  manager.release(survivors[1]);
  assert.equal(manager.reserve(survivors[3]), 1, 'the next passenger should use the vacated seat');
  manager.release(survivors[1]);
  assert.equal(manager.count, 3, 'releasing an absent passenger must not alter another reservation');
});

test('only WAITING survivors can receive a new passenger reservation', () => {
  const { boat, survivors } = fixture(1);
  const manager = new PassengerManager(boat.seats);
  for (const state of ['BOARDING', 'PASSENGER', 'DISEMBARKING', 'SAFE'] as const) {
    survivors[0].state = state;
    assert.equal(manager.reserve(survivors[0]), null, `${state} must not board again`);
    assert.equal(manager.count, 0);
  }
});

test('full boat refuses a fourth survivor and keeps three independently parented passengers aboard', () => {
  const { boat, survivors, mission } = fixture();
  for (const person of survivors.slice(0, 3)) board(boat, mission, person);
  assert.equal(mission.passengers.full, true);
  approach(boat, survivors[3]);
  assert.equal(mission.getHUD().message, 'BOAT FULL — RETURN TO CAMP');
  assert.equal(mission.getHUD().ready, false);
  assert.equal(mission.interact(), false);
  assert.equal(survivors[3].state, 'WAITING');
  assert.equal(survivors[3].character.parent, survivors[3].root);
  assert.equal(mission.passengers.count, 3);
  assert.equal(mission.safeCount, 0);
  boat.controller.position.set(6, 0, 5);
  boat.controller.yaw = -0.9;
  boat.update(3);
  const occupiedPositions: Vector3[] = [];
  for (let index = 0; index < 3; index++) {
    const person = survivors[index];
    assert.equal(person.character.parent, boat.seats[index]);
    const position = person.character.getWorldPosition(new Vector3());
    assert.ok(position.distanceTo(boat.seats[index].getWorldPosition(new Vector3())) < 1e-9);
    assert.ok(occupiedPositions.every(other => other.distanceTo(position) > 0.5), 'seat anchors must not overlap');
    occupiedPositions.push(position);
  }
  assert.equal(boat.driver.root.parent, boat.visual);
  assert.ok(occupiedPositions.every(position => position.distanceTo(boat.driver.root.getWorldPosition(new Vector3())) > 0.5));
});

test('one survivor follows all five states with callbacks and rescue counts exactly once', () => {
  const { boat, survivors: [survivor], mission } = fixture(1);
  const states: SurvivorState[] = [survivor.state];
  let boarded = 0, delivered = 0;
  mission.onRescue = () => boarded++;
  mission.onDelivered = () => delivered++;
  approach(boat, survivor);
  assert.equal(mission.interact(), true);
  states.push(survivor.state);
  assert.equal(mission.interact(), false);
  mission.update(0.5);
  assert.equal(mission.safeCount, 0);
  assert.equal(boarded, 0);
  finishTransfer(mission);
  states.push(survivor.state);
  assert.equal(boarded, 1);
  assert.equal(mission.interact(), false);
  camp(boat, mission);
  assert.equal(mission.interact(), true);
  states.push(survivor.state);
  assert.equal(mission.interact(), false);
  mission.update(1);
  assert.equal(delivered, 0);
  assert.equal(mission.safeCount, 0);
  finishTransfer(mission);
  states.push(survivor.state);
  assert.deepEqual(states, ['WAITING', 'BOARDING', 'PASSENGER', 'DISEMBARKING', 'SAFE']);
  assert.equal(delivered, 1);
  assert.equal(mission.safeCount, 1);
  assert.equal(mission.remaining, 0);
  assert.equal(mission.interact(), false);
  mission.update(10);
  assert.equal(boarded, 1);
  assert.equal(delivered, 1);
  assert.equal(mission.safeCount, 1);
});

test('passengers disembark one at a time and count as safe only when reaching camp', () => {
  const { boat, survivors, mission } = fixture();
  for (const person of survivors.slice(0, 3)) board(boat, mission, person);
  camp(boat, mission);
  const seatPositions = survivors.slice(0, 3).map(person => person.character.getWorldPosition(new Vector3()));
  assert.equal(mission.interact(), true);
  assert.deepEqual(survivors.slice(0, 3).map(person => person.state), ['DISEMBARKING', 'PASSENGER', 'PASSENGER']);
  for (let index = 0; index < 3; index++) {
    const person = survivors[index];
    assert.equal(person.state, 'DISEMBARKING');
    assert.equal(mission.safeCount, index);
    assert.equal(mission.passengers.count, 3 - index);
    assert.equal(boat.controller.locked, true);
    assert.ok(person.character.getWorldPosition(new Vector3()).distanceTo(seatPositions[index]) < 1e-9,
      'reparenting must not teleport the next passenger');
    mission.update(0.1);
    assert.ok(person.character.getWorldPosition(new Vector3()).distanceTo(seatPositions[index]) > 0);
    assert.equal(mission.safeCount, index);
    for (const queued of survivors.slice(index + 1, 3)) {
      assert.equal(queued.state, 'PASSENGER');
      assert.equal(queued.character.parent, mission.passengers.seatOf(queued));
    }
    mission.update(1);
    assert.equal(person.state, 'DISEMBARKING');
    assert.equal(mission.safeCount, index, 'partial crossings must not inflate the rescued total');
    mission.update(0.9);
    assert.equal(person.state, 'SAFE');
    assert.equal(mission.safeCount, index + 1);
    assert.equal(person.character.parent, person.root);
    const position = person.character.getWorldPosition(new Vector3());
    assert.ok(position.x >= 19 && position.x <= 29 && position.z >= 22.5 && position.z <= 27.5);
    assert.ok(Math.abs(position.y - 0.875) < 0.05, 'delivered people must stand on the camp deck');
  }
  assert.equal(mission.phase, 'search');
  assert.equal(mission.passengers.count, 0);
  assert.equal(mission.trips, 1);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.interact(), false, 'a repeated interaction cannot count a second empty trip');
  assert.equal(mission.trips, 1);
});

test('six survivors require two deliveries and the first group stays at camp while the boat returns', () => {
  const { boat, survivors, mission } = fixture();
  const driver = boat.driver.root;
  const driverOffset = driver.position.clone();
  for (const person of survivors.slice(0, 3)) board(boat, mission, person);
  camp(boat, mission);
  assert.equal(mission.interact(), true);
  finishTransfer(mission);
  assert.equal(mission.safeCount, 3);
  assert.equal(mission.remaining, 3);
  assert.equal(mission.phase, 'search');
  assert.equal(mission.getHUD().completed, false);
  const safePositions = survivors.slice(0, 3).map(person => person.character.getWorldPosition(new Vector3()));
  for (const person of survivors.slice(3)) board(boat, mission, person);
  for (let index = 0; index < 3; index++) {
    assert.equal(survivors[index].state, 'SAFE');
    assert.ok(survivors[index].character.getWorldPosition(new Vector3()).equals(safePositions[index]));
  }
  assert.equal(mission.phase, 'return');
  assert.equal(mission.getHUD().completed, false, 'having everyone aboard or safe is not completion');
  camp(boat, mission);
  mission.update(1);
  assert.equal(mission.safeCount, 3, 'the second group also requires explicit unloading');
  assert.equal(mission.interact(), true);
  finishTransfer(mission);
  assert.equal(mission.phase, 'complete');
  assert.equal(mission.safeCount, 6);
  assert.equal(mission.remaining, 0);
  assert.equal(mission.trips, 2);
  assert.equal(mission.passengers.count, 0);
  assert.ok(mission.missionTime > 0);
  assert.equal(mission.getHUD().completed, true);
  assert.equal(mission.getHUD().safe, 6);
  assert.equal(mission.getHUD().total, 6);
  assert.equal(driver.parent, boat.visual);
  assert.ok(driver.position.equals(driverOffset));
  const completedTime = mission.missionTime;
  mission.update(3);
  assert.equal(mission.missionTime, completedTime, 'the result time must stop after completion');
});

test('reset clears waiting, boarding, passenger, disembarking and safe survivors without moving the driver', () => {
  for (const checkpoint of ['WAITING', 'BOARDING', 'PASSENGER', 'DISEMBARKING', 'SAFE'] as const) {
    const { boat, survivors, mission } = fixture();
    const driver = boat.driver.root;
    const driverOffset = driver.position.clone();
    if (checkpoint === 'BOARDING') {
      approach(boat, survivors[0]);
      mission.interact();
      mission.update(0.7);
    } else if (checkpoint !== 'WAITING') {
      for (const person of survivors.slice(0, 3)) board(boat, mission, person);
      if (checkpoint === 'DISEMBARKING' || checkpoint === 'SAFE') {
        camp(boat, mission);
        mission.interact();
        mission.update(checkpoint === 'SAFE' ? 2 : 0.7);
      }
    }
    assert.ok(survivors.some(person => person.state === checkpoint));
    mission.damage(12);
    mission.reset();
    assertReset(boat, mission, survivors);
    assert.equal(boat.driver.root, driver);
    assert.ok(driver.position.equals(driverOffset));
    mission.update(5);
    assert.equal(mission.safeCount, 0, 'cancelled transfer timers must never finish after restart');
    assert.ok(survivors.every(person => person.state === 'WAITING'));
    board(boat, mission, survivors[0]);
    assert.equal(mission.passengers.count, 1, 'a restarted mission must permit a fresh seat reservation');
  }
});
