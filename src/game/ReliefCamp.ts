import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, Sprite, SpriteMaterial } from 'three';
import type { Collider } from './BoatController';

export class ReliefCamp {
  readonly root = new Group();
  readonly collider: Collider = { minX: 19, maxX: 29, minZ: 22.5, maxZ: 27.5 };
  readonly ring: Mesh;
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
    const canopy = new Mesh(new BoxGeometry(10.6, 0.15, 5.6), new MeshStandardMaterial({ color: 0xb9d0b9, roughness: 0.86 }));
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
    const sign = new Sprite(new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: true }));
    sign.position.set(24, 4.8, 25); sign.scale.set(7.5, 1.875, 1);
    this.root.add(sign);
    this.ring = new Mesh(new RingGeometry(3.75, 4, 64), new MeshBasicMaterial({ color: 0x9ed6ac, transparent: true, opacity: 0.75, side: DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(24, 0.14, 18);
    this.root.add(this.ring);
  }
  update(time: number, active: boolean) {
    this.ring.scale.setScalar(1 + Math.sin(time * 1.7) * 0.035);
    (this.ring.material as MeshBasicMaterial).opacity = active ? 0.65 + Math.sin(time * 2) * 0.18 : 0.24;
  }
}
