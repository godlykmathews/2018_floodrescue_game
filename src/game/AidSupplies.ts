import { BoxGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, RingGeometry, Shape, Vector3 } from 'three';
import type { AssetLoader } from '../utils/AssetLoader';
import type { BoatController } from './BoatController';
import { sampleFloodHeight } from './Water';

const FIRST_AID_KIT = new URL('../../models/first_aid_kit.glb', import.meta.url).href;
const HEART_COIN = new URL('../../models/life-up_heart_-_super_mario_odyssey.glb', import.meta.url).href;
const PICKUP_RADIUS = 1.9;

export type AidPickupKind = 'kit' | 'coins';
export interface AidPickup {
  readonly id: string;
  readonly kind: AidPickupKind;
  readonly value: number;
  readonly position: Vector3;
  readonly object: Group;
  collected: boolean;
}

/** Small recoverable supplies floating along the navigable rescue routes. */
export class AidSupplies {
  static readonly MODEL_LOAD_COUNT = 13;
  readonly root = new Group();
  readonly treatmentKit = new Group();
  readonly items: AidPickup[] = [];
  kits = 0;
  coins = 0;
  donated = 0;
  treated = 0;
  onPickup: (kind: AidPickupKind, value: number) => void = () => {};
  private readonly previousBoatPosition = new Vector3();
  private hasPreviousPosition = false;
  private readonly modelSlots = new Map<AidPickup, Group>();

  constructor() {
    this.root.name = 'RECOVERABLE_AID_SUPPLIES';
    this.treatmentKit.name = 'ACTIVE_FIRST_AID_TREATMENT';
    this.treatmentKit.visible = false;
    const handheldKit = fallbackKit();
    handheldKit.scale.setScalar(0.45 / 1.05);
    this.treatmentKit.add(handheldKit);
    this.root.add(this.treatmentKit);
    const raftMaterial = new MeshStandardMaterial({ color: 0x806950, roughness: 0.95 });
    const kitRingMaterial = new MeshStandardMaterial({ color: 0x80d7b2, emissive: 0x467e65, emissiveIntensity: 0.65,
      transparent: true, opacity: 0.72, roughness: 0.6, depthWrite: false });
    const coinRingMaterial = new MeshStandardMaterial({ color: 0xe2ba62, emissive: 0x9e7130, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.7, roughness: 0.6, depthWrite: false });
    const ringGeometry = new RingGeometry(0.91, 0.95, 32);
    ringGeometry.rotateX(-Math.PI / 2);
    const kitPositions = [[0, 14], [0, -9], [-7, 4.2], [26.5, 2], [24, 14], [0, 34]];
    const coinPositions = [[0, 21], [0, 1], [8, 12.8], [26.5, -3], [24, 16], [40, 10]];
    for (const kind of ['kit', 'coins'] as const) {
      const positions = kind === 'kit' ? kitPositions : coinPositions;
      positions.forEach(([x, z], index) => {
        const object = new Group();
        object.name = `AID_${kind.toUpperCase()}_${index + 1}`;
        object.position.set(x, 0, z);
        const raft = new Mesh(new BoxGeometry(kind === 'kit' ? 1.34 : 1.0, 0.16, kind === 'kit' ? 1.02 : 0.8), raftMaterial);
        raft.position.y = 0.06;
        raft.receiveShadow = true;
        const ring = new Mesh(ringGeometry, kind === 'kit' ? kitRingMaterial : coinRingMaterial);
        ring.position.y = 0.2;
        const modelSlot = new Group();
        modelSlot.position.y = 0.14;
        modelSlot.add(kind === 'kit' ? fallbackKit() : fallbackHeart());
        object.add(raft, ring, modelSlot);
        const item: AidPickup = { id: `${kind}-${index + 1}`, kind, value: kind === 'kit' ? 1 : index % 3 === 2 ? 50 : 25,
          position: new Vector3(x, 0, z), object, collected: false };
        this.items.push(item);
        this.modelSlots.set(item, modelSlot);
        this.root.add(object);
      });
    }
  }

  async load(loader: AssetLoader) {
    for (const [item, slot] of this.modelSlots) {
      const isKit = item.kind === 'kit';
      const { object } = await loader.loadModel({ path: isKit ? FIRST_AID_KIT : HEART_COIN, size: 1.05, sizeAxis: 'max',
        rotationY: isKit ? item.position.x * 0.13 : 0, fallback: isKit ? fallbackKit : fallbackHeart, shadows: false });
      slot.traverse(child => {
        if (!(child instanceof Mesh)) return;
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => material.dispose());
      });
      slot.clear();
      slot.add(object);
    }
    const { object } = await loader.loadModel({ path: FIRST_AID_KIT, size: 0.45, sizeAxis: 'max',
      fallback: fallbackKit, shadows: false });
    this.treatmentKit.traverse(child => {
      if (!(child instanceof Mesh)) return;
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    });
    this.treatmentKit.clear();
    this.treatmentKit.add(object);
  }

  reset(_levelId = 1) {
    this.kits = 0;
    this.coins = 0;
    this.donated = 0;
    this.treated = 0;
    this.treatmentKit.visible = false;
    this.hasPreviousPosition = false;
    for (const item of this.items) {
      item.collected = false;
      item.object.visible = true;
      item.object.position.copy(item.position);
      item.object.rotation.set(0, 0, 0);
    }
  }

  update(_dt: number, time: number, boat: Pick<BoatController, 'position' | 'locked'>, canCollect = true) {
    const position = boat.position;
    // Sweeping the frame's travelled segment makes pickups independent of boat speed.
    // A deliberate debug/restart teleport must not collect the entire crossed map.
    const previous = this.previousBoatPosition;
    const dx = position.x - previous.x, dz = position.z - previous.z;
    const distanceSquared = dx * dx + dz * dz;
    const sweep = this.hasPreviousPosition && distanceSquared > 0 && distanceSquared < 64;
    this.items.forEach((item, index) => {
      if (item.collected) return;
      item.object.position.y = sampleFloodHeight(item.position.x, item.position.z, time) + 0.04;
      item.object.rotation.x = Math.sin(time * 0.8 + index) * 0.035;
      item.object.rotation.z = Math.cos(time * 0.65 + index * 1.4) * 0.045;
      if (!canCollect || boat.locked) return;
      const t = sweep ? Math.max(0, Math.min(1,
        ((item.position.x - previous.x) * dx + (item.position.z - previous.z) * dz) / distanceSquared)) : 1;
      const nearestX = sweep ? previous.x + dx * t : position.x;
      const nearestZ = sweep ? previous.z + dz * t : position.z;
      if (Math.hypot(item.position.x - nearestX, item.position.z - nearestZ) > PICKUP_RADIUS) return;
      item.collected = true;
      item.object.visible = false;
      if (item.kind === 'kit') this.kits += item.value;
      else this.coins += item.value;
      this.onPickup(item.kind, item.value);
    });
    previous.copy(position);
    this.hasPreviousPosition = canCollect && !boat.locked;
  }

  nearestKit(position: Vector3): Vector3 | null {
    let closest: AidPickup | undefined;
    let distanceSquared = Infinity;
    for (const item of this.items) {
      if (item.kind !== 'kit' || item.collected) continue;
      const distance = (item.position.x - position.x) ** 2 + (item.position.z - position.z) ** 2;
      if (distance < distanceSquared) { closest = item; distanceSquared = distance; }
    }
    // A caller can use the destination as a temporary target without moving the pickup.
    return closest ? closest.position.clone() : null;
  }

  useKit(): boolean {
    if (this.kits < 1) return false;
    this.kits--;
    return true;
  }

  donate(): number {
    const donation = this.coins;
    this.donated += donation;
    this.coins = 0;
    return donation;
  }
}

function fallbackKit() {
  const kit = new Group();
  const body = new Mesh(new BoxGeometry(1.05, 0.34, 0.72), new MeshStandardMaterial({ color: 0xe5e5d9, roughness: 0.8 }));
  body.position.y = 0.17;
  const crossMaterial = new MeshStandardMaterial({ color: 0xb44035, roughness: 0.85 });
  const across = new Mesh(new BoxGeometry(0.4, 0.015, 0.13), crossMaterial);
  const along = new Mesh(new BoxGeometry(0.13, 0.015, 0.4), crossMaterial);
  across.position.y = along.position.y = 0.35;
  kit.add(body, across, along);
  return kit;
}

function fallbackHeart() {
  const shape = new Shape();
  shape.moveTo(0, -0.48);
  shape.bezierCurveTo(-0.13, -0.3, -0.5, -0.07, -0.5, 0.18);
  shape.bezierCurveTo(-0.5, 0.55, -0.12, 0.6, 0, 0.32);
  shape.bezierCurveTo(0.12, 0.6, 0.5, 0.55, 0.5, 0.18);
  shape.bezierCurveTo(0.5, -0.07, 0.13, -0.3, 0, -0.48);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, steps: 1, curveSegments: 12 });
  geometry.translate(0, 0.52, -0.09);
  return new Group().add(new Mesh(geometry, new MeshStandardMaterial({ color: 0xd8334c, metalness: 0.1, roughness: 0.3 })));
}
