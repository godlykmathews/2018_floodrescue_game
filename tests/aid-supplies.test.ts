import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Vector3 } from 'three';
import { AidSupplies } from '../src/game/AidSupplies.ts';
import { BoatController } from '../src/game/BoatController.ts';
import type { AssetLoader } from '../src/utils/AssetLoader.ts';

function collectAt(supplies: AidSupplies, boat: BoatController, x: number, z: number) {
  boat.position.set(x, 0, z);
  supplies.update(1 / 60, 0, boat, false);
  supplies.update(1 / 60, 0, boat);
}

test('a kit is recovered once from water regardless of visual height or boat speed', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  const events: [string, number][] = [];
  supplies.onPickup = (kind, value) => events.push([kind, value]);
  boat.position.set(0, 500, 14);
  boat.velocity.set(0, 0, -8.2);
  supplies.update(1 / 60, 12, boat);
  supplies.update(1 / 60, 13, boat);
  assert.equal(supplies.kits, 1);
  assert.deepEqual(events, [['kit', 1]]);
  const item = supplies.items.find(item => item.id === 'kit-1')!;
  assert.equal(item.collected, true);
  assert.equal(item.object.visible, false);
});

test('a frame that crosses a pickup collects it without requiring an exact endpoint overlap', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  boat.position.set(-3, 0, 14);
  supplies.update(1 / 60, 0, boat);
  boat.position.set(3, 0, 14);
  supplies.update(1 / 60, 1, boat);
  assert.equal(supplies.kits, 1);
});

test('paused or locked transfers cannot collect and leave no stale sweep when resumed', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  boat.position.set(0, 0, 14);
  supplies.update(1 / 60, 0, boat, false);
  assert.equal(supplies.kits, 0);
  boat.locked = true;
  supplies.update(1 / 60, 0, boat);
  assert.equal(supplies.kits, 0);
  boat.position.set(0, 0, 10);
  boat.locked = false;
  supplies.update(1 / 60, 0, boat);
  assert.equal(supplies.kits, 0);
});

test('collected kits are consumed only when one is available', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  assert.equal(supplies.useKit(), false);
  assert.equal(supplies.kits, 0);
  collectAt(supplies, boat, 0, 14);
  assert.equal(supplies.useKit(), true);
  assert.equal(supplies.useKit(), false);
  assert.equal(supplies.kits, 0);
  assert.equal(supplies.treated, 0, 'the mission records successful treatment separately from consuming a kit');
});

test('donations transfer the held balance exactly once and preserve lifetime camp support', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  collectAt(supplies, boat, 0, 21);
  collectAt(supplies, boat, 8, 12.8);
  assert.equal(supplies.coins, 75);
  assert.equal(supplies.donate(), 75);
  assert.equal(supplies.coins, 0);
  assert.equal(supplies.donated, 75);
  assert.equal(supplies.donate(), 0);
  collectAt(supplies, boat, 0, 1);
  assert.equal(supplies.donate(), 25);
  assert.equal(supplies.donated, 100);
});

test('nearest kit excludes recovered supplies, ignores vertical distance and protects its anchor', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  const nearest = supplies.nearestKit(new Vector3(0, 100, 13));
  assert.ok(nearest?.equals(new Vector3(0, 0, 14)));
  nearest!.set(99, 99, 99);
  assert.ok(supplies.items[0].position.equals(new Vector3(0, 0, 14)));
  collectAt(supplies, boat, 0, 14);
  assert.ok(!supplies.nearestKit(new Vector3(0, 0, 14))?.equals(new Vector3(0, 0, 14)));
  for (const item of supplies.items.filter(item => item.kind === 'kit')) collectAt(supplies, boat, item.position.x, item.position.z);
  assert.equal(supplies.nearestKit(new Vector3()), null);
  assert.equal(supplies.kits, 6, 'there must be ample first-aid supplies for every mission');
});

test('restart restores every pickup and clears balances without rebuilding loaded models', () => {
  const supplies = new AidSupplies(), boat = new BoatController();
  const objects = supplies.items.map(item => item.object);
  collectAt(supplies, boat, 0, 14);
  collectAt(supplies, boat, 0, 21);
  supplies.donate();
  supplies.treated = 1;
  supplies.treatmentKit.visible = true;
  supplies.reset(2);
  assert.equal(supplies.kits, 0);
  assert.equal(supplies.coins, 0);
  assert.equal(supplies.donated, 0);
  assert.equal(supplies.treated, 0);
  assert.equal(supplies.treatmentKit.visible, false);
  supplies.items.forEach((item, index) => {
    assert.equal(item.object, objects[index]);
    assert.equal(item.object.visible, true);
    assert.equal(item.collected, false);
    assert.ok(item.object.position.equals(item.position));
  });
  collectAt(supplies, boat, 0, 14);
  assert.equal(supplies.kits, 1);
});

test('kits and heart-shaped coins use their shared GLB paths with normalized instance sizes', async () => {
  const supplies = new AidSupplies();
  const paths: string[] = [];
  const loader = { loadModel: async (options: { path: string; size: number }) => {
    paths.push(options.path);
    assert.equal(options.size, paths.length <= 12 ? 1.05 : 0.45);
    return { object: new Group(), animations: [], fallback: false };
  } } as unknown as AssetLoader;
  await supplies.load(loader);
  assert.equal(paths.length, AidSupplies.MODEL_LOAD_COUNT);
  assert.equal(new Set(paths).size, 2, 'AssetLoader caches the kit and heart GLBs and clones their instances');
  assert.ok(paths[0].endsWith('/models/first_aid_kit.glb'));
  assert.equal(paths.filter(path => path.endsWith('/models/first_aid_kit.glb')).length, 7);
  assert.equal(paths.filter(path => path.endsWith('/models/life-up_heart_-_super_mario_odyssey.glb')).length, 6);
});
