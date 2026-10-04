import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { BoatController } from './BoatController';
import type { HelicopterController } from './HelicopterController';
import type { Vehicle } from './VehicleTransfer';

/** Rooftop transfer and flight views; the original boat camera stays unchanged. */
export class VehicleCamera {
  private pose = new PerspectiveCamera();
  private target = new Vector3();
  private from = new Vector3();
  private to = new Vector3();
  private fromRotation = new Quaternion();
  private toRotation = new Quaternion();
  constructor(private camera: PerspectiveCamera) {}

  private flightPose(helicopter: HelicopterController, overview: boolean) {
    this.pose.position.copy(helicopter.position).addScaledVector(helicopter.forward, overview ? -16 : -13);
    this.pose.position.y += overview ? 23 : 8;
    this.target.copy(helicopter.position).addScaledVector(helicopter.forward, 4);
    this.target.y += 1;
    this.pose.lookAt(this.target);
  }

  updateFlight(dt: number, helicopter: HelicopterController, overview: boolean) {
    this.flightPose(helicopter, overview);
    const blend = 1 - Math.exp(-3.4 * dt);
    this.camera.position.lerp(this.pose.position, blend);
    this.camera.quaternion.slerp(this.pose.quaternion, blend);
    this.camera.fov = MathUtils.damp(this.camera.fov, overview ? 52 : 60, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  begin(destination: Vehicle, boat: BoatController, helicopter: HelicopterController, overview: boolean) {
    this.from.copy(this.camera.position); this.fromRotation.copy(this.camera.quaternion);
    if (destination === 'helicopter') this.flightPose(helicopter, overview);
    else {
      this.pose.position.copy(boat.position).addScaledVector(boat.forward, overview ? -15 : -10.5);
      this.pose.position.y = overview ? 19 : 6.8;
      this.target.copy(boat.position).addScaledVector(boat.forward, overview ? 2 : 4.5);
      this.target.y = .5; this.pose.lookAt(this.target);
    }
    this.to.copy(this.pose.position); this.toRotation.copy(this.pose.quaternion);
  }

  updateTransfer(progress: number) {
    const smooth = progress * progress * (3 - 2 * progress);
    this.camera.position.lerpVectors(this.from, this.to, smooth);
    this.camera.quaternion.slerpQuaternions(this.fromRotation, this.toRotation, smooth);
  }
}
