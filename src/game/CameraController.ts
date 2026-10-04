import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { BoatController } from './BoatController';
export class CameraController {
  overview = false;
  private desired = new Vector3();
  private look = new Vector3();
  private target = new Vector3();
  private impact = 0;
  private impactTime = 0;
  constructor(readonly camera: PerspectiveCamera) {}
  toggle() { this.overview = !this.overview; }
  shake(amount: number) { this.impact = Math.min(0.12, this.impact + Math.max(0, amount)); }
  update(dt: number, boat: BoatController, snap = false) {
    if (snap) this.impact = 0;
    this.impactTime += dt;
    this.impact *= Math.exp(-9 * dt);
    this.desired.copy(boat.position).addScaledVector(boat.forward, this.overview ? -15 : -10.5);
    this.desired.y = this.overview ? 19 : 6.8;
    // Brief, sub-decimetre reaction; no persistent roll or random camera jumps.
    this.desired.y += Math.sin(this.impactTime * 43) * this.impact;
    this.desired.x += Math.cos(this.impactTime * 37) * this.impact * 0.45;
    this.target.copy(boat.position).addScaledVector(boat.forward, this.overview ? 2 : 4.5);
    this.target.y = 0.5;
    const smooth = snap ? 1 : 1 - Math.exp(-3.4 * dt);
    this.camera.position.lerp(this.desired, smooth);
    this.look.lerp(this.target, snap ? 1 : 1 - Math.exp(-5 * dt));
    this.camera.fov = MathUtils.damp(this.camera.fov, this.overview ? 52 : 58 + boat.speed * 0.4, 3, dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.look);
  }
}
