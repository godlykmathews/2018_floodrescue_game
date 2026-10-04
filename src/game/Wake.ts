import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial } from 'three';
import type { BoatController } from './BoatController';
import { sampleFloodHeight } from './Water';

const CAPACITY = 42;
const SEGMENTS = 4;
const VERTICES_PER_WAKE = (SEGMENTS + 1) * 2 * 2;

interface WakeMark { x: number; z: number; fx: number; fz: number; age: number; life: number; strength: number }

/** A fixed pool of spreading V-shaped foam ribbons, batched into one draw call. */
export class Wake {
  readonly root = new Group();
  private readonly marks: WakeMark[] = Array.from({ length: CAPACITY }, () => ({ x: 0, z: 0, fx: 0, fz: -1, age: -1, life: 3, strength: 0 }));
  private readonly positions = new Float32Array(CAPACITY * VERTICES_PER_WAKE * 3);
  private readonly colors = new Float32Array(CAPACITY * VERTICES_PER_WAKE * 4);
  private readonly positionAttribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
  private readonly colorAttribute = new BufferAttribute(this.colors, 4).setUsage(DynamicDrawUsage);
  private next = 0;
  private emission = 0;

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setAttribute('color', this.colorAttribute);
    const indices: number[] = [];
    for (let wake = 0; wake < CAPACITY; wake++) {
      for (let arm = 0; arm < 2; arm++) {
        for (let segment = 0; segment < SEGMENTS; segment++) {
          const first = wake * VERTICES_PER_WAKE + arm * (SEGMENTS + 1) * 2 + segment * 2;
          indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
        }
      }
    }
    geometry.setIndex(indices);
    const material = new MeshBasicMaterial({
      color: 0xc7c0a0, vertexColors: true, transparent: true, opacity: 0.6,
      depthWrite: false, side: DoubleSide, fog: true,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.root.add(mesh);
    this.reset();
  }

  reset() {
    this.next = 0;
    this.emission = 0;
    for (const mark of this.marks) mark.age = -1;
    this.colors.fill(0);
    this.colorAttribute.needsUpdate = true;
  }

  update(dt: number, time: number, boat: BoatController) {
    if (boat.speed > 0.45) {
      this.emission += dt;
      const interval = 0.16 - Math.min(boat.speed / 8, 1) * 0.075;
      if (this.emission >= interval) {
        this.emission %= interval;
        const mark = this.marks[this.next];
        this.next = (this.next + 1) % CAPACITY;
        const direction = boat.signedSpeed < 0 ? -1 : 1;
        mark.fx = boat.forward.x * direction;
        mark.fz = boat.forward.z * direction;
        mark.x = boat.position.x - mark.fx * 2.05;
        mark.z = boat.position.z - mark.fz * 2.05;
        mark.age = 0;
        mark.life = 2.6 + Math.min(boat.speed / 8, 1) * 0.9;
        mark.strength = Math.min(boat.speed / 4.5, 1) * 0.8;
      }
    } else this.emission = 0;

    for (let i = 0; i < CAPACITY; i++) {
      const mark = this.marks[i];
      if (mark.age < 0) continue;
      mark.age += dt;
      const progress = Math.min(mark.age / mark.life, 1);
      const opacity = mark.strength * (1 - progress) ** 1.4 * Math.min(mark.age * 9, 1);
      const rightX = -mark.fz;
      const rightZ = mark.fx;
      const spread = 1.05 + mark.age * 0.62;
      const trailing = 1.2 + mark.age * 0.35;
      const driftX = mark.x - mark.fx * mark.age * 0.12 - mark.age * 0.045;
      const driftZ = mark.z - mark.fz * mark.age * 0.12;
      for (let arm = 0; arm < 2; arm++) {
        const side = arm === 0 ? -1 : 1;
        for (let segment = 0; segment <= SEGMENTS; segment++) {
          const fraction = segment / SEGMENTS;
          const outward = side * (0.44 + fraction * spread + mark.age * 0.19);
          const backward = fraction * trailing + fraction * fraction * 0.18;
          const x = driftX + rightX * outward - mark.fx * backward;
          const z = driftZ + rightZ * outward - mark.fz * backward;
          const width = (0.045 + mark.age * 0.022) * Math.sin(Math.PI * fraction);
          const y = sampleFloodHeight(x, z, time) + 0.035;
          const alpha = opacity * Math.sin(Math.PI * fraction) ** 0.5;
          for (let edge = 0; edge < 2; edge++) {
            const vertex = i * VERTICES_PER_WAKE + arm * (SEGMENTS + 1) * 2 + segment * 2 + edge;
            const offset = edge === 0 ? -width : width;
            this.positions[vertex * 3] = x + mark.fx * offset;
            this.positions[vertex * 3 + 1] = y;
            this.positions[vertex * 3 + 2] = z + mark.fz * offset;
            this.colors[vertex * 4] = 1;
            this.colors[vertex * 4 + 1] = 1;
            this.colors[vertex * 4 + 2] = 1;
            this.colors[vertex * 4 + 3] = alpha;
          }
        }
      }
      if (progress === 1) mark.age = -1;
    }
    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }
}
