import { AnimationMixer, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import type { Collider } from './BoatController';

export class Survivor {
  readonly root = new Group();
  readonly character = new Group();
  readonly position = new Vector3(0, 1.65, -22);
  readonly collider: Collider = { minX: -3, maxX: 3, minZ: -25, maxZ: -21 };
  private mixer?: AnimationMixer;
  constructor() {
    const deck = new Mesh(new BoxGeometry(6, 0.28, 4), new MeshStandardMaterial({ color: 0x8a7760, roughness: 0.94 }));
    deck.position.set(0, 1.5, -23);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.root.add(deck, this.character);
    for (const x of [-2.7, 2.7]) {
      for (const z of [-21.3, -24.7]) {
        const leg = new Mesh(new CylinderGeometry(0.12, 0.15, 3.2, 6), new MeshStandardMaterial({ color: 0x6a5a46 }));
        leg.position.set(x, 0.1, z);
        this.root.add(leg);
      }
    }
    this.reset();
  }
  async load(loader: AssetLoader) {
    const model = await loader.loadModel({
      path: new URL('../../models/low_poly_farmer_man.glb', import.meta.url).href,
      size: 1.85, sizeAxis: 'y', rotationY: 0,
      fallback: () => {
        const person = new Group();
        const body = new Mesh(new CylinderGeometry(0.25, 0.28, 1.2, 8), new MeshStandardMaterial({ color: 0xe1ab69 }));
        body.position.y = 0.85;
        const head = new Mesh(new SphereGeometry(0.24, 10, 8), new MeshStandardMaterial({ color: 0x9e704a }));
        head.position.y = 1.65;
        person.add(body, head);
        return person;
      },
    });
    this.character.add(model.object);
    const idle = model.animations.find(clip => /idle|stand/i.test(clip.name)) ?? model.animations[0];
    if (idle) { this.mixer = new AnimationMixer(model.object); this.mixer.clipAction(idle).play(); }
  }
  reset() {
    this.root.add(this.character);
    this.character.position.copy(this.position);
    this.character.rotation.set(0, 0, 0);
    this.character.scale.setScalar(1);
  }
  update(dt: number) { this.mixer?.update(dt); }
}
