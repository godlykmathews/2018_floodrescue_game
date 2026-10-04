import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, MathUtils, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';
import type { LevelConfig } from './LevelManager';
import { sampleFloodHeight } from './Water';

const HOUSE = new URL('../../models/abandoned_house_3-low_poly.glb', import.meta.url).href;
const TINY_HOUSE = '/models/flood-tiny-house.glb';
const MANSION = '/models/flood-mansion.glb';
const HILLS = '/models/flood-hills.glb';
const LOG = '/models/flood-log.glb';
const FALLEN_TREE = '/models/flood-fallen-tree.glb';
const CAR = '/models/flood-rusty-car.glb';
const DOG = '/models/flood-dog.glb';
const CAT = '/models/flood-cat.glb';
const CHICKEN = '/models/flood-chicken.glb';
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
const dockingPoints: readonly (readonly [number, number])[] = [[0, -18], [-15, 4.2], [27.8, -12], [24, 19.5], [-29, 39]];

/** A hand-arranged village with an open central rescue route and explorable outer lanes. */
export class World {
  readonly root = new Group();
  readonly colliders: Collider[] = [];
  private debris: FloatingDebris[] = [];
  private currentStrength = 0;
  private driftTime = 0;

  constructor() {
    const ground = new Mesh(new BoxGeometry(260, 0.4, 260), new MeshStandardMaterial({ color: 0x4e513d, roughness: 1 }));
    ground.name = 'SUBMERGED_VILLAGE_GROUND';
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
      { x: -14, z: 12, rotation: 0, path: HOUSE, size: 9 },
      { x: 14, z: 7, rotation: Math.PI, path: HOUSE, size: 9 },
      { x: -15, z: -7, rotation: Math.PI / 2, path: HOUSE, size: 9 },
      { x: 15, z: -12, rotation: -Math.PI / 2, path: HOUSE, size: 9 },
      { x: 0, z: -29, rotation: 0, path: HOUSE, size: 9 },
      { x: -23, z: -30, rotation: Math.PI / 2, path: HOUSE, size: 9 },
      { x: 28, z: 30, rotation: Math.PI, path: HOUSE, size: 9 },
      // Keep the original seven footprints intact; new neighbourhoods sit outside the
      // rescue/camp approaches, with enough water between them to turn the boat.
      { x: -49, z: 22, rotation: 0.2, path: TINY_HOUSE, size: 9 },
      { x: -44, z: -22, rotation: Math.PI / 2, path: TINY_HOUSE, size: 10 },
      { x: 47, z: -38, rotation: -0.15, path: MANSION, size: 16 },
      { x: 52, z: 10, rotation: -Math.PI / 2, path: TINY_HOUSE, size: 9.5 },
      { x: -30, z: 51, rotation: 0.12, path: TINY_HOUSE, size: 10 },
      { x: 25, z: 60, rotation: Math.PI, path: TINY_HOUSE, size: 10 },
      { x: -43, z: -59, rotation: 0.15, path: MANSION, size: 17 },
      { x: 10, z: -61, rotation: 0, path: TINY_HOUSE, size: 9.5 },
    ];
    for (const house of houses) {
      const { object } = await loader.loadModel({
        path: house.path, size: house.size, sizeAxis: 'max', rotationY: house.rotation,
        position: [house.x, -1.3, house.z], fallback: fallbackHouse,
      });
      object.name = house.path === MANSION ? 'FLOODED_MANSION' : 'FLOODED_HOUSE';
      this.root.add(object);
      const bounds = new Box3().setFromObject(object);
      // Small roof overhangs should not prevent a boat from approaching the walls.
      this.colliders.push({ minX: bounds.min.x + 0.35, maxX: bounds.max.x - 0.35, minZ: bounds.min.z + 0.35, maxZ: bounds.max.z - 0.35 });
    }

    const trees = [
      [-23, 23, 12], [-32, 8, 13], [-28, -10, 11], [-36, -29, 14],
      [-14, -41, 12], [7, -40, 13], [25, -31, 11], [35, -6, 14],
      [30, 9, 12], [41, 30, 13], [15, 40, 12], [-11, 35, 11],
      [-62, 29, 15], [-62, -5, 13], [-63, -46, 16], [-25, -73, 14],
      [24, -74, 15], [65, -55, 16], [70, -15, 14], [67, 24, 15],
      [47, 60, 14], [-7, 71, 13], [-53, 57, 15], [5, 54, 12],
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
    for (const [x, z] of [[-21, 15], [21, 3], [-22, -15], [21, -18], [-8, -34], [34, 34],
      [-53, 26], [-48, -27], [40, -44], [57, 15], [-34, 55], [20, 64]]) {
      const { object } = await loader.loadModel({
        path: GRASS, size: 1.45, sizeAxis: 'y', position: [x, -0.65, z],
        rotationY: x, shadows: false, fallback: fallbackGrass,
      });
      this.root.add(object);
    }

    // Three low-cost terrain instances frame the flooded valley. Their closest
    // edges are 90m from the centre, outside the playable +/-88m water boundary.
    for (const [x, z, size, rotation] of [[-158, -30, 136, 0.12], [158, -35, 136, -0.12], [0, -170, 160, 0]]) {
      const { object } = await loader.loadModel({
        path: HILLS, size, sizeAxis: 'max', position: [x, -3.4, z],
        rotationY: rotation, shadows: false, fallback: fallbackHills,
      });
      object.name = 'VALLEY_HILLS';
      object.traverse(node => {
        if (!(node instanceof Mesh)) return;
        const applyValleyFog = (source: MeshStandardMaterial) => {
          // The valley keeps its dense flood mist while higher slopes break
          // through it. Clone materials so this cannot alter village assets.
          const material = source.clone();
          material.onBeforeCompile = shader => {
            shader.vertexShader = shader.vertexShader.replace('#include <fog_vertex>', `
              #include <fog_vertex>
              #ifdef USE_FOG
                float hillWorldHeight = (modelMatrix * vec4(transformed, 1.0)).y;
                vFogDepth *= mix(1.0, 0.55, smoothstep(6.0, 20.0, hillWorldHeight));
              #endif`);
          };
          material.customProgramCacheKey = () => 'valley-hills-height-fog-v1';
          return material;
        };
        node.material = Array.isArray(node.material)
          ? node.material.map(material => applyValleyFog(material as MeshStandardMaterial))
          : applyValleyFog(node.material as MeshStandardMaterial);
      });
      this.root.add(object);
    }

    // Fallen trees share the same bounded drift/collision pool as the scanned
    // logs. Their branches stay within a conservative footprint, away from docks.
    for (const item of this.debris.filter(item => /FLOATING_(LOG|TREE)_/.test(item.object.name))) {
      const fallenTree = item.object.name.startsWith('FLOATING_TREE_');
      const { object } = await loader.loadModel({
        path: fallenTree ? FALLEN_TREE : LOG, size: item.halfWidth * 2, sizeAxis: 'x',
        position: [0, fallenTree ? -0.55 : -0.10, 0],
        fallback: fallbackLog,
      });
      // The supplied fallen trunk has high, upturned branches. Lower its profile
      // so the trunk sits in the flood and those branches break the surface.
      if (fallenTree) object.scale.y = 0.4;
      item.object.traverse(child => { if (child instanceof Mesh) child.geometry.dispose(); });
      item.object.clear();
      item.object.add(object);
    }
    await this.addFloodedCars(loader);
    await this.addShelteredAnimals(loader);
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
      object.position.y = 0.08 + sampleFloodHeight(object.position.x, object.position.z, time)
        + Math.sin(time * 1.2 + i * 2) * 0.018;
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

  private async addFloodedCars(loader: AssetLoader) {
    for (const [x, z, rotation] of [[-31, 20, -0.35], [39, 24, 0.4], [-36, -13, Math.PI / 2]]) {
      const { object } = await loader.loadModel({
        path: CAR, size: 4.7, sizeAxis: 'max', rotationY: rotation,
        position: [x, -0.56, z], fallback: fallbackCar,
      });
      object.name = 'SUBMERGED_CAR';
      this.root.add(object);
      const bounds = new Box3().setFromObject(object);
      this.colliders.push({ minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z });
    }
  }

  private async addShelteredAnimals(loader: AssetLoader) {
    const timber = new MeshStandardMaterial({ color: 0x76644c, roughness: 0.96 });
    // These fixed, visibly supported porches stay above the waves. Camp's small
    // eastern extension keeps animals separate from the passenger walking lane.
    for (const [x, z, width, depth, top] of [[-9.2, 13, 3.1, 2.4, 1.1], [30.6, 25.2, 3.2, 2.4, 0.95], [-45.7, 23, 3, 2.6, 1.1]]) {
      const shelter = new Group();
      shelter.name = 'ANIMAL_REFUGE';
      shelter.position.set(x, 0, z);
      const deck = new Mesh(new BoxGeometry(width, 0.22, depth), timber);
      deck.position.y = top - 0.11;
      deck.castShadow = deck.receiveShadow = true;
      shelter.add(deck);
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        const support = new Mesh(new CylinderGeometry(0.11, 0.13, top + 0.8, 7), timber);
        support.position.set(side * (width / 2 - 0.18), (top - 0.8) / 2, end * (depth / 2 - 0.18));
        shelter.add(support);
      }
      this.root.add(shelter);
      this.colliders.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 });
    }
    const animals = [
      { path: DOG, name: 'SHELTERED_DOG', x: -9.2, y: 1.1, z: 13, height: 0.85, yaw: 0 },
      { path: CAT, name: 'SHELTERED_CAT', x: 30.1, y: 0.95, z: 25, height: 0.45, yaw: -Math.PI / 2 },
      { path: CHICKEN, name: 'SHELTERED_CHICKEN', x: 31.4, y: 0.95, z: 25.5, height: 0.5, yaw: 0.4 },
      { path: CHICKEN, name: 'SHELTERED_CHICKEN', x: -45.7, y: 1.1, z: 23, height: 0.5, yaw: -0.8 },
    ];
    for (const animal of animals) {
      const { object } = await loader.loadModel({
        path: animal.path, size: animal.height, sizeAxis: 'y', rotationY: animal.yaw,
        position: [animal.x, animal.y, animal.z], fallback: fallbackAnimal,
      });
      object.name = animal.name;
      this.root.add(object);
    }
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
    const specs = [[6.5, 20, 6.2, 3], [-3.8, -9, 1.8, 0], [20, 17, 2.4, 0], [-16, 27, 1.9, 0], [8, -32, 2, 0],
      [7, -2, 1.05, 1], [-25, 12, 2, 2], [-7, 11.5, 1.6, 2], [21, -24, 5.4, 3], [34, 18, 1.1, 1], [-4, 33, 0.95, 1]];
    specs.forEach(([x, z, length, kind], index) => {
      const group = new Group();
      group.name = `FLOATING_${kind === 0 ? 'LOG' : kind === 1 ? 'CONTAINER' : kind === 3 ? 'TREE' : 'WRECKAGE'}_${index}`;
      group.position.set(x, 0.08, z);
      const depth = kind === 0 ? 0.4 : kind === 1 ? 0.8 : kind === 3 ? length * 0.42 : 0.9;
      if (kind === 0 || kind === 3) {
        const log = new Mesh(new CylinderGeometry(0.14, 0.2, length, 7), material);
        log.rotation.z = Math.PI / 2; log.castShadow = true; group.add(log);
        if (kind === 3) {
          for (const direction of [-1, 1]) {
            const branch = new Mesh(new CylinderGeometry(0.04, 0.11, length * 0.4, 6), material);
            branch.rotation.z = direction * 0.65;
            branch.rotation.x = Math.PI / 2;
            branch.position.set(direction * length * 0.15, 0.05, direction * depth * 0.18);
            group.add(branch);
          }
        }
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

function fallbackLog() {
  const log = new Mesh(new CylinderGeometry(0.04, 0.045, 1, 9), new MeshStandardMaterial({ color: 0x66503b, roughness: 1 }));
  log.rotation.z = Math.PI / 2;
  return log;
}

function fallbackCar() {
  const car = new Group();
  const metal = new MeshStandardMaterial({ color: 0x796354, roughness: 0.9 });
  const body = new Mesh(new BoxGeometry(1.8, 0.6, 4.7), metal);
  body.position.y = 0.5;
  const cabin = new Mesh(new BoxGeometry(1.55, 0.65, 2.2), metal);
  cabin.position.y = 1.05;
  car.add(body, cabin);
  return car;
}

function fallbackAnimal() {
  const animal = new Group();
  const material = new MeshStandardMaterial({ color: 0x9b8060, roughness: 1 });
  const body = new Mesh(new BoxGeometry(0.7, 0.38, 0.3), material);
  body.position.y = 0.5;
  const head = new Mesh(new BoxGeometry(0.25, 0.3, 0.28), material);
  head.position.set(0.35, 0.7, 0);
  animal.add(body, head);
  for (const x of [-0.24, 0.24]) for (const z of [-0.1, 0.1]) {
    const leg = new Mesh(new BoxGeometry(0.09, 0.4, 0.09), material);
    leg.position.set(x, 0.2, z);
    animal.add(leg);
  }
  return animal;
}

function fallbackHills() {
  const hills = new Group();
  const material = new MeshStandardMaterial({ color: 0x566451, roughness: 1 });
  for (const [x, z, height] of [[-0.22, 0.08, 0.22], [0.1, -0.04, 0.36], [0.3, 0.15, 0.19]]) {
    const hill = new Mesh(new CylinderGeometry(0.04, 0.35, height, 14), material);
    hill.position.set(x, height / 2, z);
    hills.add(hill);
  }
  return hills;
}
