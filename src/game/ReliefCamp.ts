import { Box3, BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial, Ray, RingGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Collider } from './BoatController';
import type { AssetLoader } from '../utils/AssetLoader';
import { Character } from './Character';
const CREW_SIGHTLINES = [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]] as const;

export class ReliefCamp {
  readonly root = new Group();
  readonly collider: Collider = { minX: 19, maxX: 29, minZ: 22.5, maxZ: 27.5 };
  readonly ring: Mesh;
  readonly shelteredFamily = new Character();
  private readonly canopy: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly sign: Sprite;
  private readonly sightline = new Ray();
  private readonly sightlineTarget = new Vector3();
  private readonly sightlineHit = new Vector3();
  // The roof slab over the original deck footprint, including its small overhang.
  private readonly canopyBounds = new Box3(new Vector3(18.7, 3.5, 22.2), new Vector3(29.3, 4.2, 27.8));
  constructor() {
    const wood = new MeshStandardMaterial({ color: 0x716552, roughness: 0.9 });
    const deck = new Mesh(new BoxGeometry(10, 0.35, 5), wood);
    deck.position.set(24, 0.7, 25);
    deck.castShadow = true; deck.receiveShadow = true;
    this.root.add(deck);
    for (const x of [19.4, 28.6]) {
      for (const z of [22.8, 27.2]) {
        const pillar = new Mesh(new CylinderGeometry(0.13, 0.17, 5.3, 6), wood);
        pillar.position.set(x, 1.4, z);
        this.root.add(pillar);
      }
    }
    const canopy = this.canopy = new Mesh(new BoxGeometry(10.6, 0.15, 5.6), new MeshStandardMaterial({ color: 0xb9d0b9, roughness: 0.86, transparent: true, depthWrite: false }));
    canopy.position.set(24, 3.85, 25);
    canopy.rotation.z = -0.035;
    canopy.castShadow = true;
    this.root.add(canopy);
    for (let i = 0; i < 5; i++) {
      const supply = new Mesh(new BoxGeometry(0.8, 0.65, 0.7), new MeshStandardMaterial({ color: i % 2 ? 0xc2b695 : 0x667e68, roughness: 1 }));
      supply.position.set(21 + (i % 3) * 1.0, 1.2 + Math.floor(i / 3) * 0.65, 26);
      this.root.add(supply);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#214a40'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#a6ddad'; ctx.lineWidth = 5; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#e2efcf'; ctx.font = 'bold 39px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('+  RELIEF CAMP', 256, 79);
    const sign = this.sign = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: true, transparent: true, depthWrite: false }));
    sign.position.set(24, 4.8, 25); sign.scale.set(7.5, 1.875, 1);
    this.root.add(sign);
    this.ring = new Mesh(new RingGeometry(3.75, 4, 64), new MeshBasicMaterial({ color: 0x9ed6ac, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(24, 0.14, 18);
    this.root.add(this.ring);
    this.shelteredFamily.root.name = 'SHELTERED_FAMILY';
    this.shelteredFamily.root.position.set(27.65, 0.88, 25.9);
    this.root.add(this.shelteredFamily.root);
  }
  async load(loader: AssetLoader) { await this.shelteredFamily.load(loader, { model: 'mother-child' }); }
  /** Reveal the boat when the chase camera passes behind the camp roof. */
  updateView(cameraPosition: Vector3, boatPosition: Vector3, dt = 1 / 60) {
    this.sightline.origin.copy(cameraPosition);
    // Check the crew and hull edges too: in overview the centre can be clear
    // while the stern and driver are still hidden beneath the canopy.
    const roofBetweenCameraAndBoat = CREW_SIGHTLINES.some(([x, z]) => {
      this.sightlineTarget.set(boatPosition.x + x, boatPosition.y + 0.65, boatPosition.z + z);
      this.sightline.direction.subVectors(this.sightlineTarget, cameraPosition).normalize();
      const hit = this.sightline.intersectBox(this.canopyBounds, this.sightlineHit);
      return hit !== null && cameraPosition.distanceTo(hit) < cameraPosition.distanceTo(this.sightlineTarget);
    });
    const canopyTarget = roofBetweenCameraAndBoat ? 0.12 : 1;
    const signTarget = roofBetweenCameraAndBoat ? 0 : MathUtils.smoothstep(cameraPosition.distanceTo(this.sign.position), 5, 12);
    this.canopy.material.opacity = MathUtils.damp(this.canopy.material.opacity, canopyTarget, 9, dt);
    this.sign.material.opacity = MathUtils.damp(this.sign.material.opacity, signTarget, 9, dt);
    if (Math.abs(this.canopy.material.opacity - canopyTarget) < 0.001) this.canopy.material.opacity = canopyTarget;
    if (Math.abs(this.sign.material.opacity - signTarget) < 0.001) this.sign.material.opacity = signTarget;
  }

  update(time: number, active: boolean) {
    this.ring.scale.setScalar(1 + Math.sin(time * 1.7) * 0.035);
    (this.ring.material as MeshBasicMaterial).opacity = active ? 0.65 + Math.sin(time * 2) * 0.18 : 0.24;
  }
}
