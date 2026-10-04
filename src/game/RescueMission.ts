import { MathUtils, Vector3 } from 'three';
import { Boat } from './Boat';
import { Survivor } from './Survivor';
import type { HUDState } from './UI';
import type { BoatController } from './BoatController';

export type MissionPhase = 'search' | 'boarding' | 'return' | 'complete';
export type RescueCondition = 'far' | 'ahead' | 'fast' | 'align' | 'ready';

export function getRescueCondition(boat: BoatController, target: Vector3): RescueCondition {
  const dx = target.x - boat.position.x, dz = target.z - boat.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 14) return 'far';
  if (distance > 6.3) return 'ahead';
  if (boat.speed > 1.25) return 'fast';
  const facing = distance < 0.5 ? 1 : (boat.forward.x * dx + boat.forward.z * dz) / distance;
  return facing < 0.42 ? 'align' : 'ready';
}

export class RescueMission {
  phase: MissionPhase = 'search';
  readonly campPosition = new Vector3(24, 0, 18);
  private boardingTime = 0;
  private rescuedTime = 0;
  private from = new Vector3();
  private to = new Vector3();
  constructor(readonly boat: Boat, readonly survivor: Survivor) {}
  get rescued() { return this.phase === 'return' || this.phase === 'complete'; }
  get target() { return this.rescued ? this.campPosition : this.survivor.position; }
  get distance() { return Math.hypot(this.boat.controller.position.x - this.target.x, this.boat.controller.position.z - this.target.z); }

  interact() {
    if (this.phase !== 'search' || getRescueCondition(this.boat.controller, this.survivor.position) !== 'ready') return false;
    this.phase = 'boarding';
    this.boardingTime = 0;
    this.boat.controller.locked = true;
    this.boat.controller.velocity.set(0, 0, 0);
    this.survivor.character.getWorldPosition(this.from);
    return true;
  }
  update(dt: number) {
    this.survivor.update(dt);
    if (this.phase === 'boarding') {
      this.boardingTime += dt;
      const t = Math.min(this.boardingTime / 2.1, 1);
      const eased = t * t * (3 - 2 * t);
      this.boat.root.updateMatrixWorld(true);
      this.boat.seat.getWorldPosition(this.to);
      this.survivor.character.position.lerpVectors(this.from, this.to, eased);
      this.survivor.character.position.y += Math.sin(t * Math.PI) * 0.65;
      this.survivor.character.rotation.y = MathUtils.lerp(0, this.boat.controller.yaw + Math.PI, eased);
      if (t === 1) {
        this.boat.seat.add(this.survivor.character);
        this.survivor.character.position.set(0, 0, 0);
        this.survivor.character.rotation.set(0, Math.PI, 0);
        this.phase = 'return';
        this.rescuedTime = 0;
        this.boat.controller.locked = false;
      }
    } else if (this.phase === 'return') {
      this.rescuedTime += dt;
      if (this.distance < 4.2 && this.boat.controller.speed < 1.25) {
        this.phase = 'complete';
        this.boat.controller.locked = true;
        this.boat.controller.velocity.set(0, 0, 0);
      }
    }
  }
  reset() {
    this.phase = 'search';
    this.boardingTime = 0;
    this.rescuedTime = 0;
    this.boat.controller.reset();
    this.survivor.reset();
  }
  getHUD(): HUDState {
    const state: HUDState = {
      objective: this.rescued ? 'Go to the relief camp' : 'Rescue the stranded survivor',
      detail: this.rescued ? 'Bring your passenger to the green landing zone' : 'Follow the amber marker through the village',
      message: 'FIND THE STRANDED SURVIVOR', hint: 'W / A / S / D to navigate · Hold Space to slow down',
      ready: false, rescued: this.rescued, completed: this.phase === 'complete', distance: this.distance,
    };
    if (this.phase === 'search') {
      const condition = getRescueCondition(this.boat.controller, this.survivor.position);
      if (condition === 'ahead') { state.message = 'SURVIVOR AHEAD'; state.hint = 'Approach the raised platform · Hold Space to brake'; }
      if (condition === 'fast') { state.message = 'TOO FAST — SLOW DOWN'; state.hint = 'Hold Space · Rescue speed must be below 5 km/h'; }
      if (condition === 'align') { state.message = 'ALIGN THE BOAT'; state.hint = 'Turn the bow toward the survivor with A / D'; }
      if (condition === 'ready') { state.message = '[ E ]  RESCUE'; state.hint = 'Survivor in reach · Press E to help them aboard'; state.ready = true; }
    } else if (this.phase === 'boarding') {
      state.message = 'HELPING SURVIVOR ABOARD…'; state.hint = 'Hold steady. You’re making a difference.';
    } else if (this.phase === 'return') {
      state.message = this.rescuedTime < 5 ? 'SURVIVOR RESCUED' : 'GO TO THE RELIEF CAMP';
      state.hint = 'Follow the green marker · Approach the landing slowly';
      if (this.distance < 9) {
        state.message = this.boat.controller.speed > 1.25 ? 'TOO FAST — SLOW DOWN' : 'APPROACH THE RELIEF LANDING';
        state.hint = 'Enter the green ring below 5 km/h · Hold Space to brake';
      }
    } else { state.message = 'MISSION COMPLETE'; state.hint = 'One person brought to safety'; }
    return state;
  }
}
