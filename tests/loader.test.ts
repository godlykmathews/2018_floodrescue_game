import assert from 'node:assert/strict';
import test from 'node:test';
import { AnimationClip, Box3, BoxGeometry, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { AssetLoader } from '../src/utils/AssetLoader.ts';

type Progress = (event: { loaded: number; total: number }) => void;

function fixture(geometry = new BoxGeometry(2, 4, 6)) {
  const scene = new Group();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0x876543 }));
  mesh.position.set(3, -5, 9);
  scene.add(mesh);
  return { scene, mesh };
}

function stubLoader(loadAsync: (path: string, progress?: Progress) => Promise<unknown>) {
  const loader = new AssetLoader();
  // Substitute only the network boundary. Normalization, cloning, catch handling,
  // cache promises, and callbacks remain the production AssetLoader behavior.
  (loader as unknown as { loader: { loadAsync: typeof loadAsync } }).loader = { loadAsync };
  return loader;
}

function close(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} should equal ${expected}`);
}

function boundsOf(object: Group) {
  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  return { bounds, size: bounds.getSize(new Vector3()), center: bounds.getCenter(new Vector3()) };
}

function meshesOf(object: Group) {
  const meshes: Mesh[] = [];
  object.traverse(node => { if (node instanceof Mesh) meshes.push(node); });
  return meshes;
}

const unusedFallback = () => { throw new Error('Fallback must not run for a loaded asset'); };

test('normalizes imported scale, centers X/Z, and places the asset base at ground level', async () => {
  const { scene, mesh } = fixture();
  const animation = new AnimationClip('Idle', 1, []);
  const loader = stubLoader(async () => ({ scene, animations: [animation] }));
  const loaded = await loader.loadModel({ path: '/models/house.glb', size: 12, fallback: unusedFallback });
  const { bounds, size, center } = boundsOf(loaded.object);
  close(size.x, 4);
  close(size.y, 8);
  close(size.z, 12);
  close(center.x, 0);
  close(center.z, 0);
  close(bounds.min.y, 0);
  assert.equal(loaded.fallback, false);
  assert.equal(loaded.animations[0], animation);
  assert.deepEqual(mesh.position.toArray(), [3, -5, 9], 'normalization must preserve the cached source');
  assert.equal(mesh.castShadow, false, 'shadow changes must affect the clone only');
});

test('per-model rotation, chosen size axis, scale multiplier, and placement compose correctly', async () => {
  const { scene } = fixture();
  const loader = stubLoader(async () => ({ scene, animations: [] }));
  const { object } = await loader.loadModel({
    path: '/models/boat.glb', size: 6, sizeAxis: 'z', scale: 0.5,
    rotationY: Math.PI / 2, position: [7, 2, -5], fallback: unusedFallback,
  });
  const { bounds, size, center } = boundsOf(object);
  close(size.x, 9);
  close(size.y, 6);
  close(size.z, 3);
  close(center.x, 7);
  close(center.z, -5);
  close(bounds.min.y, 2);
  close(object.children[0].rotation.y, Math.PI / 2);
});

test('concurrent and later loads share one request while retaining independent clone transforms', async () => {
  const { scene } = fixture();
  let requestCount = 0;
  const loader = stubLoader(async () => {
    requestCount++;
    return { scene, animations: [] };
  });
  const [first, second] = await Promise.all([
    loader.loadModel({ path: '/models/shared.glb', size: 6, position: [3, 0, 0], fallback: unusedFallback }),
    loader.loadModel({ path: '/models/shared.glb', size: 12, position: [-4, 0, 0], fallback: unusedFallback }),
  ]);
  await loader.loadModel({ path: '/models/shared.glb', fallback: unusedFallback });
  assert.equal(requestCount, 1);
  assert.notEqual(first.object, second.object);
  assert.notEqual(first.object.children[0], second.object.children[0]);
  const firstMesh = meshesOf(first.object)[0];
  const secondMesh = meshesOf(second.object)[0];
  assert.notEqual(firstMesh, secondMesh);
  assert.equal(firstMesh.geometry, secondMesh.geometry, 'clones should share static geometry for efficiency');
  first.object.position.set(100, 100, 100);
  firstMesh.position.set(30, 40, 50);
  assert.deepEqual(second.object.position.toArray(), [-4, 0, 0]);
  assert.deepEqual(secondMesh.position.toArray(), [3, -5, 9]);
  close(boundsOf(second.object).size.z, 12);
});

test('mesh shadows default on and can be disabled for an individual model clone', async () => {
  const { scene } = fixture();
  const loader = stubLoader(async () => ({ scene, animations: [] }));
  const enabled = await loader.loadModel({ path: '/models/shadow.glb', fallback: unusedFallback });
  const disabled = await loader.loadModel({ path: '/models/shadow.glb', shadows: false, fallback: unusedFallback });
  for (const mesh of meshesOf(enabled.object)) {
    assert.equal(mesh.castShadow, true);
    assert.equal(mesh.receiveShadow, true);
  }
  for (const mesh of meshesOf(disabled.object)) {
    assert.equal(mesh.castShadow, false);
    assert.equal(mesh.receiveShadow, false);
  }
});

test('loading progress names the model and always finishes at one', async () => {
  const { scene } = fixture();
  const loader = stubLoader(async (_path, progress) => {
    progress?.({ loaded: 25, total: 100 });
    progress?.({ loaded: 100, total: 0 });
    return { scene, animations: [] };
  });
  const updates: [string, number][] = [];
  let completed = 0;
  loader.onComplete = () => { completed++; };
  loader.onProgress = (name, fraction) => updates.push([name, fraction]);
  await loader.loadModel({ path: '/models/rowing%20boat.glb', fallback: unusedFallback });
  assert.deepEqual(updates, [['rowing boat.glb', 0.25], ['rowing boat.glb', 0.5], ['rowing boat.glb', 1]]);
  assert.equal(completed, 1, 'byte progress must not count as another completed model');
});

test('a rejected GLB request warns clearly and returns normalized playable fallback geometry', async t => {
  const failure = new Error('Test model unavailable');
  let requests = 0;
  let fallbackCount = 0;
  const loader = stubLoader(async () => { requests++; throw failure; });
  const warn = t.mock.method(console, 'warn', () => {});
  const updates: number[] = [];
  loader.onProgress = (_name, fraction) => updates.push(fraction);
  const options = {
    path: '/models/missing.glb', size: 4, position: [2, 3, 4] as [number, number, number],
    fallback: () => {
      fallbackCount++;
      return new Mesh(new BoxGeometry(2, 2, 2), new MeshStandardMaterial());
    },
  };
  const first = await loader.loadModel(options);
  const second = await loader.loadModel(options);
  assert.equal(first.fallback, true);
  assert.deepEqual(first.animations, []);
  assert.equal(second.fallback, true);
  assert.equal(requests, 1, 'failed requests must also be cached');
  assert.equal(fallbackCount, 2, 'each failed model instance needs its own fallback object');
  assert.notEqual(meshesOf(first.object)[0], meshesOf(second.object)[0]);
  assert.equal(loader.warnings.length, 1, 'the HUD warning list should deduplicate the same asset');
  assert.match(loader.warnings[0], /Could not load missing\.glb; using playable fallback geometry/);
  assert.equal(warn.mock.calls.length, 2);
  assert.match(String(warn.mock.calls[0].arguments[0]), /Kerala Flood Rescue.*missing\.glb/);
  const { bounds, size, center } = boundsOf(first.object);
  assert.deepEqual(size.toArray(), [4, 4, 4]);
  close(bounds.min.y, 3);
  close(center.x, 2);
  close(center.z, 4);
  assert.deepEqual(updates, [1, 1]);
});

test('zero-size geometry retains finite transforms during normalization', async () => {
  const { scene } = fixture(new BoxGeometry(0, 0, 0));
  const loader = stubLoader(async () => ({ scene, animations: [] }));
  const { object } = await loader.loadModel({ path: '/models/point.glb', size: 6, fallback: unusedFallback });
  object.updateMatrixWorld(true);
  object.traverse(node => {
    assert.ok(node.position.toArray().every(Number.isFinite));
    assert.ok(node.scale.toArray().every(Number.isFinite));
    assert.ok(node.matrixWorld.elements.every(Number.isFinite));
  });
});

test('empty geometry uses a warned fallback without infinite or NaN transforms', async t => {
  const { scene } = fixture(new BufferGeometry());
  const loader = stubLoader(async () => ({ scene, animations: [] }));
  const warn = t.mock.method(console, 'warn', () => {});
  const { object, fallback } = await loader.loadModel({
    path: '/models/empty.glb', size: 6,
    fallback: () => new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
  });
  assert.equal(fallback, true);
  assert.equal(warn.mock.calls.length, 1);
  assert.match(loader.warnings[0], /empty\.glb.*playable fallback/);
  object.updateMatrixWorld(true);
  object.traverse(node => {
    assert.ok(node.position.toArray().every(Number.isFinite), 'empty imported bounds must leave finite positions');
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), 'empty imported bounds must leave finite matrices');
  });
});
