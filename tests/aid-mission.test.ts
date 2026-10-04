import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { AidSupplies } from '../src/game/AidSupplies.ts';
import { Boat } from '../src/game/Boat.ts';
import { GameStateManager } from '../src/game/GameStateManager.ts';
import { LEVELS } from '../src/game/LevelManager.ts';
import { RescueMission } from '../src/game/RescueMission.ts';
import { Survivor } from '../src/game/Survivor.ts';
import { SurvivorManager } from '../src/game/SurvivorManager.ts';

function fixture(injured = true) {
  const boat = new Boat(), supplies = new AidSupplies();
  const person = new Survivor({ injured });
  const mission = new RescueMission(boat, person, supplies);
  return { boat, person, supplies, mission };
}

function levelFixture() {
  const boat = new Boat(), supplies = new AidSupplies(), manager = new SurvivorManager();
  manager.configure(LEVELS[1].counts, true);
  const mission = new RescueMission(boat, manager.active, supplies);
  return { boat, supplies, manager, mission };
}

function collect(supplies: AidSupplies, boat: Boat, id: string) {
  const item = supplies.items.find(item => item.id === id)!;
  assert.ok(item, `pickup ${id} must exist`);
  boat.controller.position.copy(item.position);
  // This is a fixture relocation, so clear the previous movement segment first.
  supplies.update(0, 0, boat.controller, false);
  supplies.update(1 / 60, 0, boat.controller);
  assert.equal(item.collected, true);
}

function approach(boat: Boat, person: Survivor) {
  const east = person.locationId === 'C';
  boat.controller.position.set(person.position.x + (east ? 4 : 0), 0, person.position.z + (east ? 0 : 4));
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = east ? Math.PI / 2 : 0;
  boat.controller.forward.set(east ? -1 : 0, 0, east ? 0 : -1);
  boat.update(0);
}

function treat(boat: Boat, mission: RescueMission, person: Survivor) {
  approach(boat, person);
  assert.equal(mission.nearestSurvivor, person);
  assert.equal(mission.interact(), true);
  assert.equal(mission.phase, 'treating');
  mission.update(0.8);
  assert.equal(person.health, 'INJURED');
  mission.update(0.8);
  assert.equal(person.health, 'TREATED');
  assert.equal(person.state, 'WAITING', 'first aid does not silently board or deliver a survivor');
  assert.equal(boat.controller.locked, false);
}

function board(boat: Boat, mission: RescueMission, person: Survivor) {
  approach(boat, person);
  assert.equal(mission.nearestSurvivor, person);
  assert.equal(mission.interact(), true);
  assert.equal(person.state, 'BOARDING');
  mission.update(1);
  assert.equal(person.state, 'BOARDING');
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

function unload(boat: Boat, mission: RescueMission) {
  arrive(boat, mission);
  const people = [...mission.passengers.occupants];
  const safeBefore = mission.safeCount, tripsBefore = mission.trips;
  assert.equal(mission.interact(), true);
  for (let index = 0; index < people.length; index++) {
    assert.equal(people[index].state, 'DISEMBARKING');
    assert.equal(people.filter(person => person.state === 'DISEMBARKING').length, 1);
    assert.equal(mission.trips, tripsBefore);
    mission.update(1);
    assert.equal(mission.safeCount, safeBefore + index);
    mission.update(1);
    assert.equal(people[index].state, 'SAFE');
    assert.equal(people[index].character.parent, people[index].root);
  }
  assert.equal(mission.trips, tripsBefore + 1);
  assert.equal(mission.passengers.count, 0);
}

test('real level populations enable only the intended injuries and can reset to legacy healthy fixtures', () => {
  const manager = new SurvivorManager();
  const expected = [['A-2'], ['A-2', 'C-1'], ['A-2', 'B-3', 'C-1']];
  LEVELS.forEach((level, index) => {
    manager.configure(level.counts, true);
    assert.deepEqual(manager.active.filter(person => person.needsAid).map(person => person.id), expected[index]);
    for (const person of manager.active) assert.equal(person.medicalMarker.visible, person.needsAid);
  });
  manager.configure(LEVELS[2].counts);
  assert.ok(manager.all.every(person => person.health === 'UNHURT' && !person.medicalMarker.visible));
});

test('an injured survivor rejects rescue without a kit and points to a recoverable supply', () => {
  const { boat, person, supplies, mission } = fixture();
  approach(boat, person);
  assert.equal(mission.interact(), false);
  assert.equal(mission.phase, 'search');
  assert.equal(person.state, 'WAITING');
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.targetKind, 'kit');
  assert.ok(mission.target.equals(supplies.nearestKit(boat.controller.position)!));
  assert.equal(mission.getHUD().message, 'FIRST AID KIT NEEDED');
  assert.equal(mission.getHUD().ready, false);
  collect(supplies, boat, 'kit-2');
  approach(boat, person);
  assert.equal(mission.targetKind, 'survivor');
  assert.equal(mission.target, person.position);
  assert.equal(mission.getHUD().targetLabel, 'INJURED SURVIVOR');
  assert.equal(mission.getHUD().message, '[ E ]  GIVE FIRST AID');
});

test('first aid takes 1.6 seconds, moves a kit visibly, locks the boat and cannot consume twice', () => {
  const { boat, person, supplies, mission } = fixture();
  collect(supplies, boat, 'kit-1');
  approach(boat, person);
  boat.controller.velocity.set(0.3, 0, -0.4);
  assert.equal(mission.interact(), true);
  assert.equal(mission.phase, 'treating');
  assert.equal(mission.getHUD().ready, false);
  assert.equal(boat.controller.locked, true);
  assert.equal(boat.controller.speed, 0);
  assert.equal(supplies.kits, 1, 'the kit is committed only after treatment finishes');
  assert.equal(supplies.treatmentKit.visible, true);
  const start = supplies.treatmentKit.position.clone(), boatPosition = boat.controller.position.clone();
  assert.equal(mission.interact(), false, 'repeated E cannot restart treatment');
  boat.controller.update(0.5, { throttle: 1, steer: 1, brake: false });
  assert.ok(boat.controller.position.equals(boatPosition));
  mission.update(0.8);
  assert.ok(supplies.treatmentKit.position.distanceTo(start) > 0.1);
  assert.equal(person.health, 'INJURED');
  assert.equal(supplies.kits, 1);
  assert.equal(supplies.treated, 0);
  assert.equal(mission.interact(), false);
  mission.update(0.8);
  assert.equal(person.health, 'TREATED');
  assert.equal(person.needsAid, false);
  assert.equal(person.medicalMarker.visible, false);
  assert.equal(supplies.kits, 0);
  assert.equal(supplies.treated, 1);
  assert.equal(supplies.treatmentKit.visible, false);
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.getHUD().message, '[ E ]  RESCUE');
  assert.equal(person.treat(), false, 'the health state itself also rejects repeated treatment');
  board(boat, mission, person);
  assert.equal(supplies.treated, 1);
  assert.equal(supplies.kits, 0);
});

test('distance, alignment and lateral speed still guard first aid before any supply is consumed', () => {
  for (const scenario of ['distance', 'alignment', 'speed'] as const) {
    const { boat, person, supplies, mission } = fixture();
    collect(supplies, boat, 'kit-1');
    approach(boat, person);
    if (scenario === 'distance') boat.controller.position.z += 5;
    if (scenario === 'alignment') boat.controller.forward.set(0, 0, 1);
    if (scenario === 'speed') boat.controller.velocity.set(2, 0, 0);
    assert.equal(mission.interact(), false, `${scenario} must prevent treatment`);
    mission.update(2);
    assert.equal(person.health, 'INJURED');
    assert.equal(supplies.kits, 1);
    assert.equal(supplies.treated, 0);
    assert.equal(supplies.treatmentKit.visible, false);
    assert.equal(boat.controller.locked, false);
  }
});

test('unhurt survivors board normally without consuming collected first aid', () => {
  const { boat, person, supplies, mission } = fixture(false);
  collect(supplies, boat, 'kit-1');
  board(boat, mission, person);
  assert.equal(person.health, 'UNHURT');
  assert.equal(supplies.kits, 1);
  assert.equal(supplies.treated, 0);
});

test('camp donation requires low speed and proximity but neither passengers nor a completed trip', () => {
  const { boat, supplies, mission } = fixture();
  collect(supplies, boat, 'coins-1');
  boat.controller.position.set(24, 0, 12);
  assert.equal(mission.interact(), false);
  assert.equal(supplies.donated, 0);
  arrive(boat, mission);
  boat.controller.velocity.set(1.3, 0, 0);
  assert.equal(mission.getHUD().message, 'SLOW DOWN');
  assert.equal(mission.interact(), false);
  boat.controller.velocity.set(0, 0, 0);
  assert.equal(mission.getHUD().message, '[ E ]  DONATE COINS');
  assert.equal(mission.interact(), true);
  assert.equal(supplies.coins, 0);
  assert.equal(supplies.donated, 25);
  assert.equal(mission.getHUD().donated, 25);
  assert.equal(mission.getHUD().completed, false);
  assert.equal(mission.phase, 'search');
  assert.equal(mission.trips, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(boat.controller.locked, false);
  assert.equal(mission.interact(), false, 'repeat interaction cannot count the donation twice');
  assert.equal(supplies.donated, 25);
});

test('disembarking donates coins exactly once while preserving sequential passenger delivery', () => {
  const { boat, person, supplies, mission } = fixture(false);
  collect(supplies, boat, 'coins-1');
  collect(supplies, boat, 'coins-3');
  board(boat, mission, person);
  arrive(boat, mission);
  assert.equal(mission.interact(), true);
  assert.equal(mission.phase, 'unloading');
  assert.equal(supplies.donated, 75);
  assert.equal(supplies.coins, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.interact(), false);
  mission.update(1);
  assert.equal(mission.safeCount, 0);
  assert.equal(supplies.donated, 75);
  mission.update(1);
  assert.equal(mission.safeCount, 1);
  assert.equal(mission.phase, 'complete');
  assert.equal(mission.trips, 1);
  assert.equal(mission.interact(), false);
  assert.equal(supplies.donated, 75);
});

test('pause during first aid freezes the kit and mission timer and resumes the same transfer', () => {
  const { boat, person, supplies, mission } = fixture();
  collect(supplies, boat, 'kit-1');
  approach(boat, person);
  assert.equal(mission.interact(), true);
  const states = new GameStateManager();
  states.transition('LEVEL_INTRO'); states.transition('PLAYING'); states.transition('RESCUING');
  const tick = (dt: number) => { if (states.simulating) mission.update(dt); };
  tick(0.8);
  states.pause();
  assert.equal(states.state, 'PAUSED');
  const position = supplies.treatmentKit.position.clone(), time = mission.missionTime;
  tick(60);
  assert.ok(supplies.treatmentKit.position.equals(position));
  assert.equal(mission.missionTime, time);
  assert.equal(person.health, 'INJURED');
  assert.equal(supplies.kits, 1);
  states.resume();
  assert.equal(states.state, 'RESCUING');
  tick(0.8);
  assert.equal(person.health, 'TREATED');
  assert.equal(supplies.treated, 1);
  assert.equal(boat.controller.locked, false);
});

test('restart cancels treatment and clears held supplies, donations, health and delivery progress', () => {
  const { boat, supplies, manager, mission } = levelFixture();
  collect(supplies, boat, 'kit-1'); collect(supplies, boat, 'kit-2'); collect(supplies, boat, 'coins-1');
  board(boat, mission, manager.active[0]);
  treat(boat, mission, manager.active[1]); board(boat, mission, manager.active[1]);
  board(boat, mission, manager.active[2]);
  unload(boat, mission);
  collect(supplies, boat, 'coins-3');
  approach(boat, manager.active[3]);
  assert.equal(mission.interact(), true);
  mission.update(0.8);
  assert.equal(supplies.treatmentKit.visible, true);
  assert.equal(supplies.treated, 1);
  assert.equal(supplies.donated, 25);
  assert.equal(supplies.coins, 50);
  assert.equal(mission.safeCount, 3);
  mission.reset();
  assert.deepEqual([supplies.kits, supplies.coins, supplies.donated, supplies.treated], [0, 0, 0, 0]);
  assert.equal(supplies.treatmentKit.visible, false);
  assert.ok(supplies.items.every(item => !item.collected && item.object.visible));
  assert.equal(mission.phase, 'search');
  assert.equal(mission.trips, 0);
  assert.equal(mission.missionTime, 0);
  assert.equal(mission.safeCount, 0);
  assert.equal(mission.passengers.count, 0);
  assert.equal(boat.controller.locked, false);
  assert.ok(boat.seats.every(seat => seat.children.length === 0));
  for (const person of manager.active) {
    assert.equal(person.state, 'WAITING');
    assert.equal(person.health, ['A-2', 'C-1'].includes(person.id) ? 'INJURED' : 'UNHURT');
    assert.equal(person.character.parent, person.root);
    assert.ok(person.character.position.equals(person.position));
  }
  mission.update(5);
  assert.equal(manager.active[3].health, 'INJURED', 'the cancelled treatment cannot finish after reset');
  assert.equal(supplies.treated, 0);
});

test('Level 2 delivers all six people in two trips with two treatments, capacity enforcement and camp funding', () => {
  const { boat, supplies, manager, mission } = levelFixture();
  collect(supplies, boat, 'kit-1'); collect(supplies, boat, 'kit-2');
  collect(supplies, boat, 'coins-1'); collect(supplies, boat, 'coins-3');
  for (const person of manager.active.slice(0, 3)) {
    if (person.needsAid) treat(boat, mission, person);
    board(boat, mission, person);
  }
  assert.equal(mission.passengers.count, 3);
  approach(boat, manager.active[3]);
  assert.equal(mission.interact(), false, 'a fourth person cannot be treated or boarded with a full boat');
  assert.equal(mission.getHUD().message, 'BOAT FULL — RETURN TO CAMP');
  assert.equal(supplies.kits, 1);
  assert.equal(manager.active[3].health, 'INJURED');
  unload(boat, mission);
  assert.equal(mission.phase, 'search');
  assert.equal(mission.safeCount, 3);
  assert.equal(mission.getHUD().completed, false);
  assert.equal(supplies.donated, 75);
  const firstGroupPositions = manager.active.slice(0, 3).map(person => person.character.getWorldPosition(new Vector3()));
  collect(supplies, boat, 'coins-2');
  for (const person of manager.active.slice(3)) {
    if (person.needsAid) treat(boat, mission, person);
    board(boat, mission, person);
  }
  assert.equal(supplies.treated, 2);
  assert.equal(supplies.kits, 0);
  manager.active.slice(0, 3).forEach((person, index) => {
    assert.equal(person.state, 'SAFE');
    assert.ok(person.character.getWorldPosition(new Vector3()).equals(firstGroupPositions[index]));
  });
  unload(boat, mission);
  const result = mission.getHUD();
  assert.equal(mission.phase, 'complete');
  assert.equal(result.completed, true);
  assert.equal(result.safe, 6);
  assert.equal(result.total, 6);
  assert.equal(result.remaining, 0);
  assert.equal(result.trips, 2);
  assert.equal(result.treated, 2);
  assert.equal(result.donated, 100);
  assert.equal(result.coins, 0);
  assert.ok(manager.active.every(person => person.state === 'SAFE' && !person.needsAid && person.root.visible));
  assert.equal(boat.controller.locked, true);
  const finalTime = mission.missionTime;
  mission.update(60);
  assert.equal(mission.missionTime, finalTime);
  assert.equal(mission.interact(), false);
  assert.equal(supplies.donated, 100);
});
