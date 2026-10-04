import type { Vector3 } from 'three';
import type { BoatController } from './BoatController';
import type { HelicopterController } from './HelicopterController';

export type Vehicle = 'boat' | 'helicopter';
export type TransferCondition = 'away' | 'busy' | 'passengers' | 'fast' | 'airborne' | 'ready';

/** Switching parks the empty boat in place; it never changes mission or supplies. */
export class VehicleTransfer {
  active: Vehicle = 'boat';
  destination: Vehicle | null = null;
  private elapsed = 0;
  readonly duration = 2;
  get switching() { return this.destination !== null; }
  get progress() { return Math.min(1, this.elapsed / this.duration); }
  get dockDistance() { return Math.hypot(this.boat.position.x - this.dock.x, this.boat.position.z - this.dock.z); }

  constructor(private boat: BoatController, private helicopter: HelicopterController,
    private dock: Vector3, private radius = 3) {}

  condition(passengers: number, missionAvailable: boolean): TransferCondition {
    if (this.switching || !missionAvailable) return 'busy';
    if (this.active === 'helicopter') return this.helicopter.canSwitch ? 'ready' : 'airborne';
    if (this.dockDistance > this.radius) return 'away';
    if (passengers > 0) return 'passengers';
    if (this.boat.speed >= 1.25) return 'fast';
    return 'ready';
  }

  request(passengers: number, missionAvailable: boolean) {
    if (this.condition(passengers, missionAvailable) !== 'ready') return false;
    this.destination = this.active === 'boat' ? 'helicopter' : 'boat';
    this.elapsed = 0;
    this.boat.locked = true;
    this.boat.velocity.set(0, 0, 0); this.boat.turnVelocity = 0;
    this.helicopter.velocity.set(0, 0, 0);
    return true;
  }

  update(dt: number) {
    if (!this.switching || !Number.isFinite(dt) || dt <= 0) return false;
    this.elapsed += dt;
    if (this.progress < 1) return false;
    this.active = this.destination!;
    this.destination = null;
    this.boat.locked = this.active === 'helicopter';
    return true;
  }

  reset() {
    this.active = 'boat'; this.destination = null; this.elapsed = 0;
    this.boat.locked = false;
  }
}
