import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, MathUtils, Mesh, Raycaster, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetLoader } from '../src/utils/AssetLoader.ts';
import { BoatController } from '../src/game/BoatController.ts';
import { Helipad } from '../src/game/Helipad.ts';
import { LEVELS } from '../src/game/LevelManager.ts';
import { World } from '../src/game/World.ts';

/** Read real local GLB geometry; only browser image decoding and HTTP are replaced. */
function localAssetLoader() {
  const loader = new AssetLoader();
  const gltf = new GLTFLoader().register(() => ({
    name: 'EXT_texture_webp', loadTexture: async () => new Texture(),
  }));
  (loader as unknown as { loader: { loadAsync: (path: string) => Promise<unknown> } }).loader = {
    async loadAsync(path) {
      const file = path.startsWith('file:') ? new URL(path) : new URL(`../public${path}`, import.meta.url);
      const bytes = await readFile(file);
      return gltf.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    },
  };
  return loader;
}

async function sceneFixture() {
  const loader = localAssetLoader(), world = new World(), helipad = new Helipad();
  await world.load(loader);
  await helipad.load(loader);
  world.setDifficulty(LEVELS[2]);
  assert.deepEqual(loader.warnings, [], 'geometry checks must use real assets, never silent fallbacks');
  return { world, helipad };
}
const village = sceneFixture();

test('the entire landing pad is supported by the actual loaded brutalist roof', async () => {
  const { helipad } = await village;
  const building = helipad.root.getObjectByName('BRUTALIST_BUILDING')!;
  const pad = helipad.root.getObjectByName('HELIPAD_ROOF_SURFACE') as Mesh;
  helipad.root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(pad), centre = bounds.getCenter(new Vector3());
  const radius = (bounds.max.x - bounds.min.x) / 2 * 0.98;
  const ray = new Raycaster();
  for (let index = -1; index < 16; index++) {
    const angle = index * Math.PI / 8;
    const x = centre.x + (index < 0 ? 0 : Math.cos(angle) * radius);
    const z = centre.z + (index < 0 ? 0 : Math.sin(angle) * radius);
    ray.set(new Vector3(x, centre.y + 5, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(building, true)[0];
    assert.ok(hit, 'each edge of the pad must have real roof geometry beneath it');
    assert.ok(bounds.min.y >= hit.point.y - 0.01, 'the pad must not be buried in the roof');
    assert.ok(bounds.min.y - hit.point.y < 0.08, 'the pad must not float above the building');
    assert.ok(Math.abs(hit.face!.normal.y) > 0.99, 'landing must use a flat roof, not an ornament or slope');
  }
  assert.ok(Math.abs(helipad.landingPosition.y - bounds.max.y) < 0.02,
    'the flight controller touchdown height must meet the visible landing surface');
  assert.ok(helipad.landingPosition.distanceTo(new Vector3(centre.x, helipad.landingPosition.y, centre.z)) < 0.1,
    'the flight target must align with the painted landing circle');
});

test('the base and its access structures leave existing village houses separate and accessible', async () => {
  const { world, helipad } = await village;
  const houses = world.root.children.filter(object => /^FLOODED_(HOUSE|MANSION)$/.test(object.name));
  assert.ok(houses.length >= 12, 'this check must include the expanded village, not an empty scene');
  for (const house of houses) {
    const bounds = new Box3().setFromObject(house);
    for (const structure of helipad.colliders) {
      const xGap = Math.max(bounds.min.x - structure.maxX, structure.minX - bounds.max.x, 0);
      const zGap = Math.max(bounds.min.z - structure.maxZ, structure.minZ - bounds.max.z, 0);
      assert.ok(Math.hypot(xGap, zGap) > 0.7,
        `${house.name} at ${house.position.toArray()} must remain clear of the new base`);
    }
  }
});

test('a player boat can approach the new dock from the start basin and brake safely in strong current', async () => {
  const { world, helipad } = await village;
  const boat = new BoatController(), unobstructed = new BoatController();
  const colliders = [...world.colliders, ...helipad.colliders];
  const current = new Vector3();
  let docked = false;
  for (let frame = 0; frame < 60 * 45; frame++) {
    const delta = helipad.dockPosition.clone().sub(boat.position);
    const distance = Math.hypot(delta.x, delta.z);
    const wantedYaw = Math.atan2(-delta.x, -delta.z);
    const headingError = Math.atan2(Math.sin(wantedYaw - boat.yaw), Math.cos(wantedYaw - boat.yaw));
    const input = {
      throttle: distance > 6 ? (Math.abs(headingError) < 0.6 ? 0.8 : 0.1) : boat.speed < 0.75 && distance > 1.8 ? 0.4 : 0,
      steer: MathUtils.clamp(-headingError * 3, -1, 1),
      brake: distance < 6 && boat.speed > 0.85,
    };
    world.getCurrent(boat.position, current);
    unobstructed.position.copy(boat.position);
    unobstructed.velocity.copy(boat.velocity);
    unobstructed.yaw = boat.yaw;
    unobstructed.turnVelocity = boat.turnVelocity;
    unobstructed.update(1 / 60, input, [], current);
    boat.update(1 / 60, input, colliders, current);
    assert.ok(boat.position.distanceTo(unobstructed.position) < 1e-7,
      'the transfer approach must not rely on collision resolution pushing the boat through scenery');
    if (distance < helipad.dockRadius - 0.4 && boat.speed < 0.85) { docked = true; break; }
  }
  assert.ok(docked, 'normal throttle, steering, and brake inputs must reach the transfer zone');
  for (let frame = 0; frame < 60; frame++) {
    boat.update(1 / 60, { throttle: 0, steer: 0, brake: true }, colliders, world.getCurrent(boat.position, current));
  }
  assert.ok(boat.position.distanceTo(helipad.dockPosition) < helipad.dockRadius);
  assert.ok(boat.speed < 1.25, 'the player must be able to remain slow enough to switch vehicles');
});

test('a missing building keeps a supported roof and a collision-free boat transfer point', async t => {
  const loader = new AssetLoader(), helipad = new Helipad();
  (loader as unknown as { loader: { loadAsync: () => Promise<never> } }).loader = {
    loadAsync: async () => { throw new Error('Missing building fixture'); },
  };
  t.mock.method(console, 'warn', () => {});
  await helipad.load(loader);
  assert.equal(loader.warnings.length, 1);
  const building = helipad.root.getObjectByName('BRUTALIST_BUILDING')!;
  helipad.root.updateMatrixWorld(true);
  const ray = new Raycaster(helipad.landingPosition.clone().add(new Vector3(0, 5, 0)), new Vector3(0, -1, 0));
  const hit = ray.intersectObject(building, true)[0];
  assert.ok(hit && Math.abs(hit.point.y - helipad.landingPosition.y) < 0.1,
    'fallback geometry must support the same touchdown position');
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const boat = new BoatController();
    boat.position.copy(helipad.dockPosition); boat.yaw = yaw;
    boat.update(1 / 60, { throttle: 0, steer: 0, brake: true }, helipad.colliders);
    assert.ok(boat.position.equals(helipad.dockPosition), 'the designated dock must fit the complete collision hull');
  }
});
