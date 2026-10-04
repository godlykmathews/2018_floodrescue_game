import { MathUtils, Vector3 } from 'three';

export interface HelicopterInput { throttle: number; steer: number; lift: number; brake: boolean }

/** A forgiving flight envelope keeps the prototype clear of roofs and trees. */
export class HelicopterController {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  readonly forward = new Vector3(0, 0, -1);
  readonly landingPosition = new Vector3();
  readonly landingRadius = 4;
  yaw = 0;
  turnVelocity = 0;
  private grounded = true;
  private right = new Vector3(1, 0, 0);

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }
  get signedSpeed() { return this.velocity.dot(this.forward); }
  get altitude() { return this.position.y; }
  get heightAbovePad() { return this.position.y - this.landingPosition.y; }
  get minimumFlightAltitude() { return Math.max(20, this.landingPosition.y + 3); }
  get padDistance() { return Math.hypot(this.position.x - this.landingPosition.x, this.position.z - this.landingPosition.z); }
  get landingAvailable() { return this.padDistance <= this.landingRadius && this.speed < 1.3; }
  get landed() { return this.grounded; }
  get canSwitch() { return this.grounded && this.padDistance <= this.landingRadius && this.speed < 0.1; }

  reset(landingPosition: Vector3) {
    this.landingPosition.copy(landingPosition);
    this.position.copy(landingPosition);
    this.velocity.set(0, 0, 0);
    this.forward.set(0, 0, -1);
    this.yaw = 0;
    this.turnVelocity = 0;
    this.grounded = true;
  }

  update(dt: number, input: HelicopterInput) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Small, bounded steps make landing and takeoff behave alike at 30–120 Hz.
    const steps = Math.ceil(Math.min(dt, 0.1) / (1 / 120));
    const step = Math.min(dt, 0.1) / steps;
    for (let index = 0; index < steps; index++) this.advance(step, input);
  }

  private advance(dt: number, input: HelicopterInput) {
    const throttle = MathUtils.clamp(input.throttle, -1, 1);
    const lift = MathUtils.clamp(input.lift, -1, 1);
    if (this.grounded) {
      this.velocity.set(0, 0, 0);
      this.turnVelocity = 0;
      if (lift <= 0) return;
      this.grounded = false;
    }

    this.turnVelocity = MathUtils.damp(this.turnVelocity, -MathUtils.clamp(input.steer, -1, 1) * 1.05, 4, dt);
    this.yaw += this.turnVelocity * dt;
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const cruising = this.position.y >= this.minimumFlightAltitude - 0.025;
    const drag = input.brake || !cruising ? 5.8 : 0.52;
    const forwardSpeed = MathUtils.clamp(
      (this.signedSpeed + (cruising && !input.brake ? throttle * 7 : 0) * dt) * Math.exp(-drag * dt), -5, 12,
    );
    const lateralSpeed = this.velocity.dot(this.right) * Math.exp(-(input.brake || !cruising ? 5.8 : 2.4) * dt);
    const verticalSpeed = this.velocity.y;
    this.velocity.copy(this.forward).multiplyScalar(forwardSpeed).addScaledVector(this.right, lateralSpeed);
    this.velocity.y = verticalSpeed;

    let targetVertical = lift >= 0 ? lift * 5.5 : lift * 3.2;
    const mayLand = this.landingAvailable;
    const landingAssist = lift < 0 && mayLand && Math.abs(throttle) < 0.05;
    if (landingAssist) {
      // The ring is an approach target, not permission to put the skids over
      // the parapet. A slow final approach centers the aircraft before touchdown.
      const distance = this.padDistance;
      const approachSpeed = Math.min(1.05, distance * 1.2);
      const factor = distance > 0.0001 ? approachSpeed / distance : 0;
      this.velocity.x = MathUtils.damp(this.velocity.x, (this.landingPosition.x - this.position.x) * factor, 3.8, dt);
      this.velocity.z = MathUtils.damp(this.velocity.z, (this.landingPosition.z - this.position.z) * factor, 3.8, dt);
    }
    // Horizontal input after lifting off gently finishes the ascent first.
    // No horizontal jump or altitude snap is needed to clear the roof.
    if (!cruising && (!mayLand || Math.abs(throttle) > 0.05)) {
      targetVertical = Math.max(targetVertical, Math.min(4, (this.minimumFlightAltitude - this.position.y) * 2 + 0.3));
    }
    this.velocity.y = MathUtils.damp(this.velocity.y, targetVertical, 3.5, dt);

    // Below cruise altitude the helicopter stays in the landing column.
    const nextX = this.position.x + this.velocity.x * dt;
    const nextZ = this.position.z + this.velocity.z * dt;
    const nextPadDistance = Math.hypot(nextX - this.landingPosition.x, nextZ - this.landingPosition.z);
    if (!cruising && nextPadDistance > this.landingRadius) {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
    this.position.addScaledVector(this.velocity, dt);

    const floor = mayLand ? this.landingPosition.y + (landingAssist && this.padDistance > 0.35 ? 0.65 : 0) : this.minimumFlightAltitude;
    // While taking off, stay continuous below the safety floor until it is reached.
    if (this.position.y < floor && (cruising || mayLand)) {
      this.position.y = floor;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (this.position.y >= 55) {
      this.position.y = 55;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
    for (const axis of ['x', 'z'] as const) {
      if (Math.abs(this.position[axis]) > 82) {
        this.position[axis] = MathUtils.clamp(this.position[axis], -82, 82);
        this.velocity[axis] = 0;
      }
    }

    if (mayLand && lift <= 0 && this.heightAbovePad <= 0.025 && this.speed < 0.35 && this.velocity.y <= 0.1) {
      this.position.y = this.landingPosition.y;
      this.velocity.set(0, 0, 0);
      this.turnVelocity = 0;
      this.grounded = true;
    }
  }
}
