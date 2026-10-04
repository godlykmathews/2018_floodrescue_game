import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { Survivor } from './Survivor';
import type { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';

export type RescueSiteId = 'A' | 'B' | 'C';
export interface RescueSite { id: RescueSiteId; name: string; position: Vector3; docking: Vector3; yaw: number; people: Survivor[] }
export class SurvivorManager {
  readonly root = new Group();
  readonly colliders: Collider[] = [];
  readonly sites: RescueSite[] = [];
  readonly all: Survivor[] = [];
  active: Survivor[] = [];
  constructor() {
    const specs = [
      { id: 'A' as const, name: 'HOUSE TERRACE', center: [0, 1.5, -23], width: 6, depth: 4, dock: [0, 0, -18], yaw: 0 },
      { id: 'B' as const, name: 'RAISED PLATFORM', center: [-15, 1.16, -0.8], width: 6, depth: 4, dock: [-15, 0, 4.2], yaw: 0 },
      { id: 'C' as const, name: 'ROOF ANNEX', center: [22, 2.26, -12], width: 6, depth: 5, dock: [27.8, 0, -12], yaw: Math.PI / 2 },
    ];
    specs.forEach((spec, siteIndex) => {
      const [x, y, z] = spec.center;
      const material = new MeshStandardMaterial({ color: [0x8a7760, 0x6f807d, 0xa29a81][siteIndex], roughness: 0.95 });
      const deck = new Mesh(new BoxGeometry(spec.width, 0.28, spec.depth), material);
      deck.position.set(x, y, z); deck.castShadow = true; deck.receiveShadow = true;
      this.root.add(deck);
      for (const dx of [-spec.width / 2 + 0.22, spec.width / 2 - 0.22]) for (const dz of [-spec.depth / 2 + 0.22, spec.depth / 2 - 0.22]) {
        const support = new Mesh(new CylinderGeometry(siteIndex === 2 ? 0.23 : 0.12, 0.23, y + 2.5, 6), material);
        support.position.set(x + dx, (y - 2.5) / 2, z + dz); this.root.add(support);
      }
      if (siteIndex === 2) {
        const back = new Mesh(new BoxGeometry(0.2, 0.65, 5), material);
        back.position.set(19.1, 2.7, -12); this.root.add(back);
      }
      this.colliders.push({ minX: x - spec.width / 2, maxX: x + spec.width / 2, minZ: z - spec.depth / 2, maxZ: z + spec.depth / 2 });
      const site: RescueSite = { id: spec.id, name: spec.name, position: new Vector3(x, y + 2.3, z), docking: new Vector3().fromArray(spec.dock), yaw: spec.yaw, people: [] };
      for (let i = 0; i < 3; i++) {
        const offset = [0, -1.25, 1.25][i];
        const position: [number, number, number] = spec.id === 'C' ? [23.5, y + 0.14, -12 + offset] : [x + offset, y + 0.14, spec.id === 'A' ? -22 : 0];
        const person = new Survivor({ id: `${spec.id}-${i + 1}`, locationId: spec.id, position, rotationY: spec.id === 'C' ? -Math.PI / 2 : Math.PI, variant: this.all.length, platform: false });
        site.people.push(person); this.all.push(person); this.root.add(person.root);
      }
      this.sites.push(site);
    });
    this.configure([2, 1, 3]);
  }
  async load(loader: AssetLoader) { for (const person of this.all) await person.load(loader); }
  configure(counts: readonly number[]) {
    this.active = [];
    this.sites.forEach((site, siteIndex) => site.people.forEach((person, index) => {
      person.reset(); person.root.visible = index < counts[siteIndex];
      if (person.root.visible) this.active.push(person);
    }));
  }
}
