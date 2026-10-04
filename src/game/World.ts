import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, MathUtils, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';
import type { LevelConfig } from './LevelManager';

const HOUSE = new URL('../../models/abandoned_house_3-low_poly.glb', import.meta.url).href;
const TREE = new URL('../../models/jabami_anime_tree-grass_v1.glb', import.meta.url).href;
const GRASS = new URL('../../models/grass.glb', import.meta.url).href;

interface FloatingDebris {
  object: Object3D;
  collider: Collider;
  anchor: Vector3;
  halfWidth: number;
  halfDepth: number;
  phase: number;
  active: boolean;
}

// Clear approach basins around terraces and the landing remain free of drifting obstacles.
const approachZones: readonly Collider[] = [
  { minX: -5, maxX: 5, minZ: -26, maxZ: -14 },
  { minX: -20, maxX: -10, minZ: -4, maxZ: 8 },
  { minX: 19, maxX: 32, minZ: -17, maxZ: -7 },
  { minX: 20.5, maxX: 31, minZ: 15, maxZ: 28 },
];
const dockingPoints: readonly (readonly [number, number])[] = [[0, -18], [-15, 4.2], [27.8, -12], [24, 19.5]];

/** A small, hand-arranged village with wide water lanes and inexpensive static collisions. */
export class World {
  readonly root = new Group();
  readonly colliders: Collider[] = [];
  private debris: FloatingDebris[] = [];
  private currentStrength = 0;
  private driftTime = 0;

  constructor() {
    const ground = new Mesh(new BoxGeometry(124, 0.4, 124), new MeshStandardMaterial({ color: 0x4e513d, roughness: 1 }));
    ground.position.y = -2.2;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.addUtilities();
    this.addWalls();
    this.addDebris();
  }

  async load(loader: AssetLoader) {
    // The southern gap is the starting basin; the central lane leads north to rescue.
    // Camp and rescue platforms are supplied by their own gameplay modules.
    const houses = [
      { x: -14, z: 12, rotation: 0 },
      { x: 14, z: 7, rotation: Math.PI },
      { x: -15, z: -7, rotation: Math.PI / 2 },
      { x: 15, z: -12, rotation: -Math.PI / 2 },
      { x: 0, z: -29, rotation: 0 },
      { x: -23, z: -30, rotation: Math.PI / 2 },
      { x: 28, z: 30, rotation: Math.PI },
    ];
    for (const house of houses) {
      const { object } = await loader.loadModel({
        path: HOUSE, size: 9, sizeAxis: 'max', rotationY: house.rotation,
        position: [house.x, -1.3, house.z], fallback: fallbackHouse,
      });
      this.root.add(object);
      const bounds = new Box3().setFromObject(object);
      // Small roof overhangs should not prevent a boat from approaching the walls.
      this.colliders.push({ minX: bounds.min.x + 0.35, maxX: bounds.max.x - 0.35, minZ: bounds.min.z + 0.35, maxZ: bounds.max.z - 0.35 });
    }

    const trees = [
      [-23, 23, 12], [-32, 8, 13], [-28, -10, 11], [-36, -29, 14],
      [-14, -41, 12], [7, -40, 13], [25, -31, 11], [35, -6, 14],
      [30, 9, 12], [41, 30, 13], [15, 40, 12], [-11, 35, 11],
    ];
    for (const [x, z, height] of trees) {
      const { object } = await loader.loadModel({
        path: TREE, size: height, sizeAxis: 'y', position: [x, -1.2, z],
        rotationY: x * 0.61, fallback: fallbackTree, shadows: false,
      });
      this.root.add(object);
      // The canopy is deliberately excluded: only the trunk blocks the hull.
      this.colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
    }
    for (const [x, z] of [[-21, 15], [21, 3], [-22, -15], [21, -18], [-8, -34], [34, 34]]) {
      const { object } = await loader.loadModel({
        path: GRASS, size: 1.45, sizeAxis: 'y', position: [x, -0.65, z],
        rotationY: x, shadows: false, fallback: fallbackGrass,
      });
      this.root.add(object);
    }
  }

  setDifficulty(level: LevelConfig) {
    this.currentStrength = level.currentStrength;
    this.driftTime = 0;
    this.debris.forEach((item, index) => {
      // Keep the original prototype's third log until a level is configured, then move it
      // outside the protected relief approach before enabling its drift.
      if (index === 2) item.anchor.set(18.5, 0.08, 16);
      item.active = index < Math.min(this.debris.length, level.debrisCount);
      item.object.visible = item.active;
      item.object.position.copy(item.anchor);
      this.placeCollider(item, item.anchor.x, item.anchor.z);
      const colliderIndex = this.colliders.indexOf(item.collider);
      if (item.active && colliderIndex < 0) this.colliders.push(item.collider);
      if (!item.active && colliderIndex >= 0) this.colliders.splice(colliderIndex, 1);
    });
  }

  getCurrent(position: Vector3, out: Vector3) {
    const region = 0.75 + 0.5 * MathUtils.smoothstep(position.x, -10, 22);
    let shelter = 1;
    for (const [x, z] of dockingPoints) {
      const distance = Math.hypot(position.x - x, position.z - z);
      shelter = Math.min(shelter, 0.08 + 0.92 * MathUtils.smoothstep(distance, 4, 10));
    }
    return out.set(0.55 + Math.sin(position.z * 0.045) * 0.18, 0, 0.8 + Math.cos(position.x * 0.08) * 0.1)
      .normalize().multiplyScalar(this.currentStrength * region * shelter);
  }

  update(time: number, dt = 0) {
    this.driftTime += Math.min(0.1, Math.max(0, dt));
    this.debris.forEach((item, i) => {
      if (!item.active) return;
      const object = item.object;
      object.position.y = 0.08 + Math.sin(time * 1.2 + i * 2) * 0.055;
      object.rotation.x = Math.sin(time * 0.9 + i) * 0.025;
      if (this.currentStrength === 0) return;
      // Slow local eddies make the hazard move without eventually sealing a rescue route.
      const amplitude = (0.35 + this.currentStrength * 0.6) * Math.min(1, this.driftTime / 5);
      const x = item.anchor.x + Math.sin(this.driftTime * 0.095 + item.phase) * amplitude;
      const z = item.anchor.z + Math.sin(this.driftTime * 0.07 + item.phase) * amplitude * 0.7;
      const candidate = { minX: x - item.halfWidth, maxX: x + item.halfWidth, minZ: z - item.halfDepth, maxZ: z + item.halfDepth };
      const intersects = (box: Collider) => candidate.minX < box.maxX + 0.15 && candidate.maxX > box.minX - 0.15
        && candidate.minZ < box.maxZ + 0.15 && candidate.maxZ > box.minZ - 0.15;
      if (approachZones.some(intersects) || this.colliders.some(box => box !== item.collider && intersects(box))) return;
      object.position.x = x; object.position.z = z;
      this.placeCollider(item, x, z);
    });
  }

  private placeCollider(item: FloatingDebris, x: number, z: number) {
    Object.assign(item.collider, { minX: x - item.halfWidth, maxX: x + item.halfWidth,
      minZ: z - item.halfDepth, maxZ: z + item.halfDepth });
  }

  private addUtilities() {
    const poleMaterial = new MeshStandardMaterial({ color: 0x626a65, roughness: 0.94 });
    const wireMaterial = new LineBasicMaterial({ color: 0x394340, transparent: true, opacity: 0.7 });
    const positions = [[-8, 21], [-8, 1], [-8, -19], [-8, -39]];
    for (const [x, z] of positions) {
      const pole = new Mesh(new CylinderGeometry(0.1, 0.15, 7, 6), poleMaterial);
      pole.position.set(x, 2.7, z);
      const crossbar = new Mesh(new BoxGeometry(1.6, 0.12, 0.14), poleMaterial);
      crossbar.position.set(x, 5.9, z);
      this.root.add(pole, crossbar);
      this.colliders.push({ minX: x - 0.18, maxX: x + 0.18, minZ: z - 0.18, maxZ: z + 0.18 });
    }
    for (let i = 1; i < positions.length; i++) {
      for (const offset of [-0.6, 0.6]) {
        const points: Vector3[] = [];
        for (let j = 0; j <= 12; j++) {
          const t = j / 12;
          points.push(new Vector3(-8 + offset, 5.95 - Math.sin(Math.PI * t) * 0.7, positions[i - 1][1] * (1 - t) + positions[i][1] * t));
        }
        this.root.add(new Line(new BufferGeometry().setFromPoints(points), wireMaterial));
      }
    }
  }

  private addWalls() {
    const material = new MeshStandardMaterial({ color: 0x828d7e, roughness: 1 });
    for (const [x, z, width, depth] of [[-14, 18, 6, 0.45], [19.7, 7, 0.45, 7], [-20.3, -6, 0.45, 5], [15, -18, 5, 0.45]]) {
      const wall = new Mesh(new BoxGeometry(width, 1.9, depth), material);
      wall.position.set(x, -0.5, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
      this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
    }
  }

  private addDebris() {
    const material = new MeshStandardMaterial({ color: 0x574633, roughness: 0.98 });
    const containerMaterial = new MeshStandardMaterial({ color: 0x596f72, roughness: 0.94 });
    const plankMaterial = new MeshStandardMaterial({ color: 0x807158, roughness: 1 });
    const specs = [[5.5, 15, 2.2, 0], [-3.8, -9, 1.8, 0], [20, 17, 2.4, 0], [-16, 27, 1.9, 0], [8, -32, 2, 0],
      [7, -2, 1.05, 1], [-25, 12, 2, 2], [-7, 11.5, 1.6, 2], [21, -24, 2.3, 0], [34, 18, 1.1, 1], [-4, 33, 0.95, 1]];
    specs.forEach(([x, z, length, kind], index) => {
      const group = new Group();
      group.name = `FLOATING_${kind === 0 ? 'LOG' : kind === 1 ? 'CONTAINER' : 'WRECKAGE'}_${index}`;
      group.position.set(x, 0.08, z);
      const depth = kind === 0 ? 0.4 : kind === 1 ? 0.8 : 0.9;
      if (kind === 0) {
        const log = new Mesh(new CylinderGeometry(0.14, 0.2, length, 7), material);
        log.rotation.z = Math.PI / 2; log.castShadow = true; group.add(log);
      } else {
        const body = new Mesh(new BoxGeometry(length, kind === 1 ? 0.65 : 0.18, depth), kind === 1 ? containerMaterial : plankMaterial);
        body.castShadow = true; group.add(body);
        if (kind === 2) {
          const brace = new Mesh(new BoxGeometry(0.2, 0.1, depth), material);
          brace.position.y = 0.13; group.add(brace);
        }
      }
      this.root.add(group);
      const collider = { minX: x - length / 2, maxX: x + length / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
      const active = index < 5;
      group.visible = active;
      this.debris.push({ object: group, collider, anchor: group.position.clone(), halfWidth: length / 2, halfDepth: depth / 2, phase: index * 1.7, active });
      if (active) this.colliders.push(collider);
    });
  }
}

function fallbackHouse() {
  const house = new Group();
  const walls = new Mesh(new BoxGeometry(8, 4.7, 7), new MeshStandardMaterial({ color: 0xa99d80, roughness: 1 }));
  walls.position.y = 2.35;
  const roof = new Mesh(new CylinderGeometry(0, 6.3, 2.2, 4), new MeshStandardMaterial({ color: 0x675243, roughness: 1 }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 5.8;
  house.add(walls, roof);
  return house;
}

function fallbackTree() {
  const tree = new Group();
  const trunk = new Mesh(new CylinderGeometry(0.2, 0.38, 7, 7), new MeshStandardMaterial({ color: 0x534b37, roughness: 1 }));
  trunk.position.y = 3.5;
  const foliage = new Mesh(new CylinderGeometry(0.5, 2.4, 5, 8), new MeshStandardMaterial({ color: 0x416546, roughness: 1 }));
  foliage.position.y = 8;
  tree.add(trunk, foliage);
  return tree;
}

function fallbackGrass() {
  return new Mesh(new CylinderGeometry(0.1, 1.3, 1.4, 5), new MeshStandardMaterial({ color: 0x66714a, roughness: 1 }));
}
