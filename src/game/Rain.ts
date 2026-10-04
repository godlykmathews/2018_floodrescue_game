import { BufferAttribute, BufferGeometry, DynamicDrawUsage, LineBasicMaterial, LineSegments, Vector3 } from 'three';

/** One draw call for all rain streaks, recycled in a volume around the boat. */
export class Rain {
  readonly mesh: LineSegments;
  private readonly count = 2300;
  private activeCount = 1700;
  private intensity = 1;
  private readonly positions = new Float32Array(this.count * 6);
  private readonly speeds = new Float32Array(this.count);
  private readonly lengths = new Float32Array(this.count);
  private readonly attribute: BufferAttribute;

  constructor() {
    for (let i = 0; i < this.count; i++) {
      const offset = i * 6;
      this.positions[offset] = Math.random() * 68 - 34;
      this.positions[offset + 1] = Math.random() * 30;
      this.positions[offset + 2] = Math.random() * 68 - 34;
      this.speeds[i] = 22 + Math.random() * 10;
      this.lengths[i] = 0.5 + Math.random() * 0.65;
      this.updateEnd(i);
    }
    const geometry = new BufferGeometry();
    this.attribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.attribute);
    geometry.setDrawRange(0, this.activeCount * 2);
    this.mesh = new LineSegments(geometry, new LineBasicMaterial({
      color: 0xccdedb, transparent: true, opacity: 0.29,
      depthWrite: false, fog: true,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setIntensity(multiplier: number) {
    this.intensity = Math.min(1.35, Math.max(0.5, multiplier));
    this.activeCount = Math.min(this.count, Math.round(1700 * this.intensity));
    this.mesh.geometry.setDrawRange(0, this.activeCount * 2);
    (this.mesh.material as LineBasicMaterial).opacity = 0.29 + (this.intensity - 1) * 0.1;
  }

  update(dt: number, center: Vector3) {
    this.mesh.position.set(center.x, Math.max(0, center.y - 8), center.z);
    for (let i = 0; i < this.activeCount; i++) {
      const offset = i * 6;
      this.positions[offset] -= dt * 3.4;
      this.positions[offset + 1] -= dt * this.speeds[i] * (0.9 + this.intensity * 0.1);
      this.positions[offset + 2] += dt * 1.2;
      if (this.positions[offset + 1] < -0.2) {
        this.positions[offset] = Math.random() * 68 - 34;
        this.positions[offset + 1] = 28 + Math.random() * 2;
        this.positions[offset + 2] = Math.random() * 68 - 34;
      }
      if (this.positions[offset] < -34) this.positions[offset] += 68;
      if (this.positions[offset + 2] > 34) this.positions[offset + 2] -= 68;
      this.updateEnd(i);
    }
    this.attribute.needsUpdate = true;
  }

  private updateEnd(i: number) {
    const offset = i * 6;
    this.positions[offset + 3] = this.positions[offset] + this.lengths[i] * 0.13;
    this.positions[offset + 4] = this.positions[offset + 1] + this.lengths[i];
    this.positions[offset + 5] = this.positions[offset + 2] - this.lengths[i] * 0.045;
  }
}
