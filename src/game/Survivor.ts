import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';
import { Character, type CharacterOptions } from './Character';

export type SurvivorState = 'WAITING' | 'BOARDING' | 'PASSENGER' | 'DISEMBARKING' | 'SAFE';
export interface SurvivorOptions { id?: string; locationId?: string; position?: [number, number, number]; rotationY?: number; variant?: number; platform?: boolean; model?: CharacterOptions['model']; clinging?: boolean }

export class Survivor {
  readonly root = new Group();
  readonly actor = new Character();
  readonly character = this.actor.root;
  readonly position = new Vector3();
  readonly collider: Collider = { minX: -3, maxX: 3, minZ: -25, maxZ: -21 };
  readonly id: string;
  readonly locationId: string;
  state: SurvivorState = 'WAITING';
  constructor(readonly options: SurvivorOptions = {}) {
    this.id = options.id ?? 'survivor-1';
    this.locationId = options.locationId ?? 'A';
    this.position.fromArray(options.position ?? [0, 1.65, -22]);
    if (options.platform !== false) {
      const wood = new MeshStandardMaterial({ color: 0x8a7760, roughness: 0.94 });
      const deck = new Mesh(new BoxGeometry(6, 0.28, 4), wood);
      deck.position.set(0, 1.5, -23); deck.castShadow = true; deck.receiveShadow = true;
      this.root.add(deck);
      for (const x of [-2.7, 2.7]) for (const z of [-21.3, -24.7]) {
        const leg = new Mesh(new CylinderGeometry(0.12, 0.15, 3.2, 6), wood);
        leg.position.set(x, 0.1, z); this.root.add(leg);
      }
    }
    this.reset();
  }
  async load(loader: AssetLoader) {
    await this.actor.load(loader, { variant: this.options.variant ?? 0, model: this.options.model });
    this.actor.setClinging(this.options.clinging ? 1 : 0);
  }
  reset() {
    this.state = 'WAITING';
    this.root.add(this.character);
    this.character.position.copy(this.position);
    this.character.rotation.set(0, this.options.rotationY ?? 0, 0);
    this.actor.resetScale();
    this.actor.setSeated(0);
    this.actor.setClinging(this.options.clinging ? 1 : 0);
  }
  update(dt: number) { this.actor.update(dt); }
}
