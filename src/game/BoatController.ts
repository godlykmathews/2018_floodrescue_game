import { MathUtils, Vector3 } from 'three';

export interface BoatInput { throttle: number; steer: number; brake: boolean }
export interface Collider { minX: number; maxX: number; minZ: number; maxZ: number }

/** Arcade water motion, independent of rendering and frame rate. Forward is local -Z. */
export class BoatController {
  readonly position = new Vector3(0, 0, 27);
  readonly velocity = new Vector3();
  yaw = 0;
  turnVelocity = 0;
  locked = false;
  readonly forward = new Vector3(0, 0, -1);
  private right = new Vector3(1, 0, 0);
  get speed() { return this.velocity.length(); }
  get signedSpeed() { return this.velocity.dot(this.forward); }

  reset() {
    this.position.set(0, 0, 27);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.turnVelocity = 0;
    this.forward.set(0, 0, -1);
    this.locked = false;
  }

  update(dt: number, input: BoatInput, colliders: readonly Collider[] = []) {
    if (this.locked) { this.velocity.set(0, 0, 0); this.turnVelocity = 0; return; }
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const forwardSpeed = this.velocity.dot(this.forward);
    const lateralSpeed = this.velocity.dot(this.right);
    const drag = input.brake ? 3.6 : 0.25;
    const acceleration = input.throttle >= 0 ? 3.8 : 2.7;
    const nextForward = MathUtils.clamp((forwardSpeed + input.throttle * acceleration * dt) * Math.exp(-drag * dt), -2.6, 8.2);
    const lateral = lateralSpeed * Math.exp(-(input.brake ? 3.8 : 1.65) * dt);
    this.velocity.copy(this.forward).multiplyScalar(nextForward).addScaledVector(this.right, lateral);
    const authority = 0.24 + Math.min(Math.abs(nextForward) / 5, 1) * 0.83;
    const targetTurn = -input.steer * authority * (nextForward < -0.25 ? -1 : 1);
    this.turnVelocity = MathUtils.damp(this.turnVelocity, targetTurn, 4.5, dt);
    this.yaw += this.turnVelocity * dt;
    this.position.addScaledVector(this.velocity, dt);
    // Three inexpensive hull circles keep both bow and stern out of buildings.
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    for (let pass = 0; pass < 2; pass++) {
      for (const offset of [-1.25, 0, 1.25]) {
        for (const box of colliders) this.resolveCollision(box, offset);
      }
    }
    const limit = 57;
    if (Math.abs(this.position.x) > limit || Math.abs(this.position.z) > limit) {
      this.position.x = MathUtils.clamp(this.position.x, -limit, limit);
      this.position.z = MathUtils.clamp(this.position.z, -limit, limit);
      this.velocity.multiplyScalar(0.4);
    }
  }

  private resolveCollision(box: Collider, offset: number) {
    const radius = 0.72;
    const x = this.position.x + this.forward.x * offset;
    const z = this.position.z + this.forward.z * offset;
    let dx = x - MathUtils.clamp(x, box.minX, box.maxX);
    let dz = z - MathUtils.clamp(z, box.minZ, box.maxZ);
    const distance = Math.hypot(dx, dz);
    if (distance >= radius) return;
    let overlap = radius - distance;
    if (distance < 0.0001) {
      const edges = [x - box.minX, box.maxX - x, z - box.minZ, box.maxZ - z];
      const index = edges.indexOf(Math.min(...edges));
      dx = index === 0 ? -1 : index === 1 ? 1 : 0;
      dz = index === 2 ? -1 : index === 3 ? 1 : 0;
      overlap = edges[index] + radius;
    } else { dx /= distance; dz /= distance; }
    this.position.x += dx * (overlap + 0.015);
    this.position.z += dz * (overlap + 0.015);
    const inward = this.velocity.x * dx + this.velocity.z * dz;
    if (inward < 0) {
      this.velocity.x -= dx * inward * 1.2;
      this.velocity.z -= dz * inward * 1.2;
      this.velocity.multiplyScalar(0.68);
    }
  }
}
