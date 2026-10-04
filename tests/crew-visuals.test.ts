import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { AssetLoader } from '../src/utils/AssetLoader.ts';
import { Boat } from '../src/game/Boat.ts';
import { RescueMission } from '../src/game/RescueMission.ts';
import { Survivor } from '../src/game/Survivor.ts';

function fixture(count = 1) {
  const boat = new Boat();
  const people = Array.from({ length: count }, (_, index) => new Survivor({
    id: String(index), position: [0, 1.65, -22], rotationY: Math.PI, platform: false,
  }));
  return { boat, people, mission: new RescueMission(boat, people) };
}
function approach(boat: Boat) {
  boat.controller.position.set(0, 0, -18);
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = 0;
  boat.controller.forward.set(0, 0, -1);
  boat.update(0);
}
function transfer(mission: RescueMission) {
  for (let frame = 0; frame < 600 && ['boarding', 'unloading'].includes(mission.phase); frame++) mission.update(1 / 60);
}
function arrive(boat: Boat, x: number, z: number, yaw = Math.PI) {
  boat.controller.position.set(x, 0, z);
  boat.controller.velocity.set(0, 0, 0);
  boat.controller.yaw = yaw;
  boat.update(0);
}

test('restart preserves a loaded character variant scale', async () => {
  const loader = new AssetLoader();
  loader.loadModel = async () => ({
    object: new Group().add(new Mesh(new BoxGeometry(0.4, 1.7, 0.3), new MeshStandardMaterial())),
    animations: [], fallback: false,
  });
  const survivor = new Survivor({ variant: 2, platform: false });
  await survivor.load(loader);
  assert.equal(survivor.character.scale.x, 1.025);
  survivor.character.scale.setScalar(0.5);
  survivor.reset();
  assert.deepEqual(survivor.character.scale.toArray(), [1.025, 1.025, 1.025]);
});

test('boarding and unloading characters face the direction they travel', () => {
  const { boat, people: [person], mission } = fixture();
  approach(boat);
  assert.equal(mission.interact(), true);
  mission.update(0.5);
  assert.ok(-Math.cos(person.character.rotation.y) > 0.9, 'approach is south toward boat, not north toward house');
  transfer(mission);
  assert.equal(person.character.rotation.y, 0, 'seated character faces the bow');
  arrive(boat, 24, 18);
  assert.equal(mission.interact(), true);
  mission.update(0.9);
  assert.ok(-Math.cos(person.character.rotation.y) > 0.9, 'dock crossing should face south toward the dock');
  transfer(mission);
  assert.equal(person.state, 'SAFE');
  assert.ok(Math.abs(Math.sin(person.character.rotation.y)) < 1e-6);
  assert.ok(Math.cos(person.character.rotation.y) > 0.99, 'safe character faces water after arrival');
});

test('unloading rejects distant crossings while retaining camp and smoke docking positions', () => {
  const { boat, mission } = fixture();
  approach(boat); mission.interact(); transfer(mission);
  arrive(boat, 24, 13.9);
  assert.ok(mission.campDistance < 4.2, 'regression position lies in original broad zone');
  assert.equal(mission.canUnload, false, 'a seven-metre water crossing must be rejected');
  assert.equal(mission.interact(), false);
  for (const [x, z] of [[24, 18], [24, 19.5], [26, 19]]) {
    arrive(boat, x, z);
    assert.equal(mission.canUnload, true, `intended docking position (${x},${z}) remains valid`);
  }
  arrive(boat, 24, 18, Math.PI / 2);
  assert.equal(mission.canUnload, false, 'broadside boat is still too far from the dock');
  arrive(boat, 24, 20, Math.PI / 2);
  assert.equal(mission.canUnload, true, 'closer broadside approaches remain available');
});

test('all nine rescued people fit on the camp deck clear of supply crates', () => {
  const { boat, people, mission } = fixture(9);
  for (let trip = 0; trip < 3; trip++) {
    approach(boat);
    for (let passenger = 0; passenger < 3; passenger++) {
      assert.equal(mission.interact(), true); transfer(mission);
    }
    arrive(boat, 24, 18);
    assert.equal(mission.interact(), true); transfer(mission);
  }
  assert.equal(mission.safeCount, 9);
  assert.equal(mission.trips, 3);
  for (const person of people) {
    const position = person.character.getWorldPosition(new Vector3());
    assert.ok(position.x > 19 && position.x < 29 && position.z > 22.5 && position.z < 27.5);
    assert.ok(position.z + 0.3 < 25.65, 'standing body must clear front face of supply crates');
  }
});
