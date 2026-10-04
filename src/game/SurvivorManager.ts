import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { Survivor } from './Survivor';
import type { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';
import { sampleFloodHeight } from './Water';

export type RescueSiteId = 'A' | 'B' | 'C';
export interface RescueSite { id: RescueSiteId; name: string; position: Vector3; docking: Vector3; yaw: number; people: Survivor[] }
export class SurvivorManager {
  readonly root = new Group();
  readonly colliders: Collider[] = [];
  readonly sites: RescueSite[] = [];
  readonly all: Survivor[] = [];
  readonly rescueLog = new Group();
  active: Survivor[] = [];
  constructor() {
    const specs = [
      { id: 'A' as const, name: 'HOUSE TERRACE', center: [0, 1.5, -23], width: 6, depth: 4, dock: [0, 0, -18], yaw: 0 },
      { id: 'B' as const, name: 'ANCHORED LOG', center: [-15, 0, 0], width: 6.4, depth: 0.7, dock: [-15, 0, 4.2], yaw: 0 },
      { id: 'C' as const, name: 'ROOF ANNEX', center: [22, 2.26, -12], width: 6, depth: 5, dock: [27.8, 0, -12], yaw: Math.PI / 2 },
    ];
    specs.forEach((spec, siteIndex) => {
      const [x, y, z] = spec.center;
      const material = new MeshStandardMaterial({ color: [0x8a7760, 0x6f807d, 0xa29a81][siteIndex], roughness: 0.95 });
      if (spec.id !== 'B') {
        const deck = new Mesh(new BoxGeometry(spec.width, 0.28, spec.depth), material);
        deck.position.set(x, y, z); deck.castShadow = true; deck.receiveShadow = true;
        this.root.add(deck);
        for (const dx of [-spec.width / 2 + 0.22, spec.width / 2 - 0.22]) for (const dz of [-spec.depth / 2 + 0.22, spec.depth / 2 - 0.22]) {
          const support = new Mesh(new CylinderGeometry(siteIndex === 2 ? 0.23 : 0.12, 0.23, y + 2.5, 6), material);
          support.position.set(x + dx, (y - 2.5) / 2, z + dz); this.root.add(support);
        }
      }
      if (siteIndex === 2) {
        const back = new Mesh(new BoxGeometry(0.2, 0.65, 5), material);
        back.position.set(19.1, 2.7, -12); this.root.add(back);
      }
      this.colliders.push({ minX: x - spec.width / 2, maxX: x + spec.width / 2, minZ: z - spec.depth / 2, maxZ: z + spec.depth / 2 });
      const site: RescueSite = { id: spec.id, name: spec.name, position: new Vector3(x, y + 2.3, z), docking: new Vector3().fromArray(spec.dock), yaw: spec.yaw, people: [] };
      for (let i = 0; i < 3; i++) {
        const offset = [0, -1.25, 1.25][i];
        const position: [number, number, number] = spec.id === 'C' ? [23.5, y + 0.14, -12 + offset]
          : spec.id === 'B' ? [x + offset, -1.05, 0.65] : [x + offset, y + 0.14, -22];
        const woman = (spec.id === 'A' && i === 1) || (spec.id === 'B' && i === 2) || (spec.id === 'C' && i !== 1);
        const person = new Survivor({ id: `${spec.id}-${i + 1}`, locationId: spec.id, position,
          rotationY: spec.id === 'C' ? -Math.PI / 2 : spec.id === 'B' ? 0 : Math.PI,
          variant: this.all.length, model: woman ? 'woman' : 'farmer', clinging: spec.id === 'B', platform: false });
        site.people.push(person); this.all.push(person); this.root.add(person.root);
      }
      this.sites.push(site);
    });
    this.rescueLog.name = 'ANCHORED_RESCUE_LOG';
    this.rescueLog.position.set(-15, -0.18, 0);
    this.root.add(this.rescueLog);
    // Short tethers keep the rescue log at its predictable, approachable location.
    const ropeMaterial = new MeshStandardMaterial({ color: 0xb6a27b, roughness: 1 });
    for (const x of [-18, -12]) {
      const stake = new Mesh(new CylinderGeometry(0.095, 0.13, 2.9, 7), new MeshStandardMaterial({ color: 0x5b4a36, roughness: 1 }));
      stake.position.set(x, -0.55, -1.05); this.root.add(stake);
      const from = new Vector3(x, 0.28, -1.05), to = new Vector3(x, 0.05, 0);
      const rope = new Mesh(new CylinderGeometry(0.025, 0.025, from.distanceTo(to), 5), ropeMaterial);
      rope.position.copy(from).add(to).multiplyScalar(0.5);
      rope.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.sub(from).normalize()); this.root.add(rope);
    }
    this.configure([2, 1, 3]);
  }
  async load(loader: AssetLoader) {
    const log = await loader.loadModel({ path: '/models/flood-log.glb', size: 6.4, sizeAxis: 'x', fallback: () => {
      const mesh = new Mesh(new CylinderGeometry(0.26, 0.32, 6.4, 10), new MeshStandardMaterial({ color: 0x67523a, roughness: 0.95 }));
      mesh.rotation.z = Math.PI / 2; return new Group().add(mesh);
    } });
    this.rescueLog.add(log.object);
    for (const person of this.all) await person.load(loader);
  }
  update(time: number) {
    const height = sampleFloodHeight(-15, 0, time) * 0.65;
    this.rescueLog.position.y = -0.18 + height;
    for (const person of this.sites[1].people) {
      if (person.state === 'WAITING') person.character.position.y = person.position.y + height;
    }
  }
  configure(counts: readonly number[], withInjuries = false) {
    this.active = [];
    this.sites.forEach((site, siteIndex) => site.people.forEach((person, index) => {
      person.configureInjury(withInjuries && ['A-2', 'B-3', 'C-1'].includes(person.id));
      person.reset(); person.root.visible = index < counts[siteIndex];
      if (person.root.visible) this.active.push(person);
    }));
  }
}
