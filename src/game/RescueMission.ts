import { MathUtils, Vector3 } from 'three';
import { Boat } from './Boat';
import { Survivor } from './Survivor';
import { PassengerManager } from './PassengerManager';
import type { HUDState } from './UI';
import type { BoatController } from './BoatController';
import type { AidSupplies } from './AidSupplies';

export type MissionPhase = 'search' | 'treating' | 'boarding' | 'return' | 'unloading' | 'complete' | 'failed';
export type RescueCondition = 'far' | 'ahead' | 'fast' | 'align' | 'ready';
const facingYaw = (from: Vector3, to: Vector3) => Math.atan2(from.x - to.x, from.z - to.z);
const blendYaw = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
export function getRescueCondition(boat: BoatController, target: Vector3): RescueCondition {
  const dx = target.x - boat.position.x, dz = target.z - boat.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 14) return 'far';
  if (distance > 5.4) return 'ahead';
  if (boat.speed > 1.25) return 'fast';
  const facing = distance < 0.5 ? 1 : (boat.forward.x * dx + boat.forward.z * dz) / distance;
  return facing < 0.42 ? 'align' : 'ready';
}

/** Owns survivor state changes, transfers, delivery counts and mission progress. */
export class RescueMission {
  phase: MissionPhase = 'search';
  readonly campPosition = new Vector3(24, 0, 18);
  readonly passengers: PassengerManager;
  readonly survivors: Survivor[];
  readonly survivor: Survivor; // First survivor remains convenient for single-person fixtures.
  trips = 0;
  missionTime = 0;
  integrity = 100;
  onRescue: () => void = () => {};
  onDelivered: () => void = () => {};
  private transferTime = 0;
  private active: Survivor | null = null;
  private unloadQueue: Survivor[] = [];
  private from = new Vector3();
  private to = new Vector3();
  private edge = new Vector3();
  private dock = new Vector3(24, 0.9, 23.1);
  private fromYaw = 0;
  private notice = '';
  private noticeTime = 0;
  constructor(readonly boat: Boat, people: Survivor | Survivor[], readonly supplies?: AidSupplies) {
    this.survivors = Array.isArray(people) ? people : [people];
    this.survivor = this.survivors[0];
    this.passengers = new PassengerManager(boat.seats);
  }
  get rescued() { return this.passengers.count > 0 || this.safeCount > 0; }
  get safeCount() { return this.survivors.filter(person => person.state === 'SAFE').length; }
  get waiting() { return this.survivors.filter(person => person.state === 'WAITING'); }
  get remaining() { return this.survivors.length - this.safeCount; }
  get nearestSurvivor() {
    let closest: Survivor | null = null, distance = Infinity;
    for (const person of this.waiting) {
      const d = this.horizontalDistance(person.position);
      if (d < distance) { closest = person; distance = d; }
    }
    return closest;
  }
  get target() {
    const nearest = this.nearestSurvivor;
    if (this.passengers.full || !nearest || ((this.passengers.count > 0 || (this.supplies?.coins ?? 0) > 0) && this.campDistance < 9)) return this.campPosition;
    if (nearest.needsAid && this.supplies && this.supplies.kits === 0) {
      return this.supplies.nearestKit(this.boat.controller.position) ?? nearest.position;
    }
    return nearest.position;
  }
  get targetKind(): 'survivor' | 'camp' | 'kit' {
    if (this.target === this.campPosition) return 'camp';
    return this.target === this.nearestSurvivor?.position ? 'survivor' : 'kit';
  }
  get distance() { return this.horizontalDistance(this.target); }
  get campDistance() { return this.horizontalDistance(this.campPosition); }
  get canDonate() { return (this.supplies?.coins ?? 0) > 0 && this.campDistance < 4.2 && this.boat.controller.speed < 1.25; }
  get canUnload() {
    if (!this.passengers.count || this.campDistance >= 4.2 || this.boat.controller.speed >= 1.25) return false;
    const edge = this.dockEdge();
    return Math.hypot(edge.x - this.dock.x, edge.z - this.dock.z) <= 3.3;
  }
  private dockEdge() {
    this.boat.root.updateMatrixWorld(true);
    const localDock = this.boat.visual.worldToLocal(this.dock.clone());
    const localEdge = Math.abs(localDock.z) > Math.abs(localDock.x)
      ? new Vector3(0, 0.4, Math.sign(localDock.z) * 2.15)
      : new Vector3(Math.sign(localDock.x) * 0.62, 0.4, 0.3);
    return this.boat.visual.localToWorld(localEdge);
  }
  private horizontalDistance(target: Vector3) { return Math.hypot(this.boat.controller.position.x - target.x, this.boat.controller.position.z - target.z); }
  private lockBoat() { this.boat.controller.locked = true; this.boat.controller.velocity.set(0, 0, 0); this.boat.controller.turnVelocity = 0; }
  notify(message: string) { this.notice = message; this.noticeTime = 3; }
  private donate() {
    const amount = this.supplies?.donate() ?? 0;
    if (amount) this.notify(`${amount} COINS DONATED · CAMP SUPPLIES FUNDED`);
  }

  interact() {
    if (['treating', 'boarding', 'unloading', 'complete', 'failed'].includes(this.phase)) return false;
    if (this.canUnload) {
      this.donate();
      this.phase = 'unloading'; this.lockBoat();
      this.unloadQueue = [...this.passengers.occupants];
      this.startDisembarking();
      return true;
    }
    if (this.canDonate) { this.donate(); return true; }
    const person = this.nearestSurvivor;
    if (!person || this.passengers.full || getRescueCondition(this.boat.controller, person.position) !== 'ready') return false;
    if (person.needsAid) {
      if (!this.supplies?.kits) { this.notify('FIRST AID KIT NEEDED · FOLLOW THE MEDICAL MARKER'); return false; }
      this.phase = 'treating'; this.active = person; this.transferTime = 0; this.lockBoat();
      this.boat.root.updateMatrixWorld(true);
      this.from.copy(this.boat.visual.localToWorld(new Vector3(0, 0.7, -1.7)));
      this.supplies.treatmentKit.position.copy(this.from); this.supplies.treatmentKit.visible = true;
      return true;
    }
    if (this.passengers.reserve(person) === null) return false;
    person.state = 'BOARDING'; this.active = person;
    this.phase = 'boarding'; this.transferTime = 0; this.lockBoat();
    person.character.updateWorldMatrix(true, false);
    person.character.getWorldPosition(this.from);
    this.fromYaw = person.character.rotation.y;
    return true;
  }
  private startDisembarking() {
    this.active = this.unloadQueue.shift() ?? null;
    if (!this.active) {
      this.trips++;
      this.phase = this.safeCount === this.survivors.length ? 'complete' : 'search';
      this.boat.controller.locked = this.phase === 'complete';
      return;
    }
    const person = this.active;
    person.state = 'DISEMBARKING'; this.transferTime = 0;
    // Reparent with world transform preserved before a visible trip onto the dock.
    person.root.updateMatrixWorld(true);
    person.root.attach(person.character);
    person.character.getWorldPosition(this.from);
    this.fromYaw = person.character.rotation.y;
    const index = this.survivors.indexOf(person);
    this.to.set(20.1 + (index % 5) * 1.65, 0.88, 24.3 + Math.floor(index / 5) * 0.95);
    this.edge.copy(this.dockEdge());
  }
  update(dt: number) {
    if (this.phase === 'complete' || this.phase === 'failed') return;
    this.noticeTime = Math.max(0, this.noticeTime - dt);
    this.missionTime += dt;
    this.survivors.forEach(person => person.update(dt));
    this.boat.driver?.update(dt);
    if (!this.active) return;
    this.transferTime += dt;
    if (this.phase === 'treating') {
      const person = this.active;
      const progress = Math.min(this.transferTime / 1.6, 1);
      person.character.getWorldPosition(this.to); this.to.y += 1.2;
      const kit = this.supplies!.treatmentKit;
      kit.position.lerpVectors(this.from, this.to, MathUtils.smoothstep(progress, 0, 1));
      kit.position.y += Math.sin(progress * Math.PI) * 0.3;
      if (progress === 1) {
        if (this.supplies!.useKit() && person.treat()) {
          this.supplies!.treated++;
          this.notify('FIRST AID GIVEN · READY TO BOARD');
        }
        kit.visible = false; this.active = null; this.phase = this.passengers.count ? 'return' : 'search'; this.boat.controller.locked = false;
      }
      return;
    }
    const t = Math.min(this.transferTime / 2, 1);
    const person = this.active;
    if (this.phase === 'boarding') {
      if (person.options.clinging) person.actor.setClinging(1 - MathUtils.smoothstep(t, 0, 0.25));
      const seat = this.passengers.seatOf(person)!;
      this.boat.root.updateMatrixWorld(true);
      seat.getWorldPosition(this.to);
      this.edge.copy(this.boat.visual.localToWorld(new Vector3(0, 0.42, -2.1)));
      if (t < 0.68) {
        const u = MathUtils.smoothstep(t / 0.68, 0, 1);
        person.character.position.lerpVectors(this.from, this.edge, u);
        person.character.position.y += Math.sin(u * Math.PI) * 0.18;
      } else {
        const u = MathUtils.smoothstep((t - 0.68) / 0.32, 0, 1);
        person.character.position.lerpVectors(this.edge, this.to, u);
      }
      const approachYaw = facingYaw(this.from, this.edge);
      if (t < 0.68) {
        person.character.rotation.y = blendYaw(this.fromYaw, approachYaw, MathUtils.smoothstep(t, 0, 0.2));
      } else {
        const u = (t - 0.68) / 0.32;
        const walkingYaw = blendYaw(approachYaw, facingYaw(this.edge, this.to), MathUtils.smoothstep(u, 0, 0.25));
        person.character.rotation.y = blendYaw(walkingYaw, this.boat.controller.yaw, MathUtils.smoothstep(u, 0.45, 1));
      }
      person.actor.setSeated(MathUtils.smoothstep((t - 0.65) / 0.35, 0, 1));
      if (t === 1) {
        seat.add(person.character); person.character.position.set(0, 0, 0); person.character.rotation.set(0, 0, 0);
        person.actor.setSeated(1); person.state = 'PASSENGER'; this.active = null;
        this.phase = 'return'; this.boat.controller.locked = false; this.onRescue();
      }
    } else if (this.phase === 'unloading') {
      person.actor.setSeated(1 - MathUtils.smoothstep(t / 0.3, 0, 1));
      if (t < 0.3) person.character.position.lerpVectors(this.from, this.edge, MathUtils.smoothstep(t / 0.3, 0, 1));
      else if (t < 0.7) {
        const u = MathUtils.smoothstep((t - 0.3) / 0.4, 0, 1);
        person.character.position.lerpVectors(this.edge, this.dock, u);
        person.character.position.y += Math.sin(u * Math.PI) * 0.15;
      } else person.character.position.lerpVectors(this.dock, this.to, MathUtils.smoothstep((t - 0.7) / 0.3, 0, 1));
      const edgeYaw = facingYaw(this.from, this.edge);
      const dockYaw = facingYaw(this.edge, this.dock);
      if (t < 0.3) person.character.rotation.y = blendYaw(this.fromYaw, edgeYaw, MathUtils.smoothstep(t, 0, 0.15));
      else if (t < 0.7) person.character.rotation.y = blendYaw(edgeYaw, dockYaw, MathUtils.smoothstep(t, 0.3, 0.4));
      else {
        const walkingYaw = blendYaw(dockYaw, facingYaw(this.dock, this.to), MathUtils.smoothstep(t, 0.7, 0.78));
        person.character.rotation.y = blendYaw(walkingYaw, 0, MathUtils.smoothstep(t, 0.94, 1));
      }
      if (t === 1) {
        person.character.position.copy(this.to); person.actor.setSeated(0); person.state = 'SAFE';
        this.passengers.release(person); this.onDelivered(); this.startDisembarking();
      }
    }
  }
  damage(amount: number) {
    if (this.phase === 'complete' || this.phase === 'failed') return;
    this.integrity = Math.max(0, this.integrity - amount);
    if (this.integrity === 0) { this.phase = 'failed'; this.lockBoat(); }
  }
  reset() {
    this.phase = 'search'; this.transferTime = 0; this.active = null; this.unloadQueue = [];
    this.trips = 0; this.missionTime = 0; this.integrity = 100;
    this.noticeTime = 0; this.notice = ''; this.supplies?.reset();
    this.passengers.reset(); this.boat.controller.reset();
    this.survivors.forEach(person => person.reset());
  }
  getHUD(): HUDState {
    let objective = this.passengers.full ? 'Return to relief camp' : 'Rescue remaining survivors';
    if (!this.waiting.length && this.passengers.count) objective = 'Deliver passengers';
    let message = '', ready = false;
    if (this.phase === 'treating') message = 'GIVING FIRST AID';
    else if (this.phase === 'boarding') message = 'BOARDING';
    else if (this.phase === 'unloading') message = 'DISEMBARKING';
    else if (this.phase === 'complete') { objective = 'All survivors safe'; message = 'MISSION COMPLETE'; }
    else if (this.phase === 'failed') message = 'BOAT DAMAGED';
    else if ((this.passengers.count || (this.supplies?.coins ?? 0)) && this.campDistance < 9) {
      message = this.boat.controller.speed >= 1.25 ? 'SLOW DOWN'
        : this.canUnload ? '[ E ]  DISEMBARK PASSENGERS' : this.canDonate ? '[ E ]  DONATE COINS' : '';
      ready = this.canUnload || this.canDonate;
    } else if (this.passengers.full) message = 'BOAT FULL — RETURN TO CAMP';
    else if (this.nearestSurvivor) {
      const condition = getRescueCondition(this.boat.controller, this.nearestSurvivor.position);
      if (condition === 'fast') message = 'SLOW DOWN';
      if (condition === 'align') message = 'ALIGN THE BOAT';
      if (condition === 'ready') {
        const aidNeeded = this.nearestSurvivor.needsAid;
        ready = !aidNeeded || (this.supplies?.kits ?? 0) > 0;
        message = aidNeeded ? ready ? '[ E ]  GIVE FIRST AID' : 'FIRST AID KIT NEEDED' : '[ E ]  RESCUE';
      }
    }
    if (this.targetKind === 'kit' && this.phase !== 'treating') objective = 'Collect a first aid kit';
    return { objective, detail: `${this.remaining} remaining · ${this.safeCount} / ${this.survivors.length} safe`, message, hint: '', ready,
      rescued: this.passengers.count > 0, completed: this.phase === 'complete', distance: this.distance,
      passengers: this.passengers.count, total: this.survivors.length, safe: this.safeCount, remaining: this.remaining,
      integrity: this.integrity, time: this.missionTime, trips: this.trips, failed: this.phase === 'failed', targetIsCamp: this.target === this.campPosition,
      kits: this.supplies?.kits, coins: this.supplies?.coins, donated: this.supplies?.donated, treated: this.supplies?.treated,
      injured: this.survivors.filter(person => person.needsAid).length, notice: this.noticeTime > 0 ? this.notice : '',
      targetKind: this.targetKind, targetLabel: this.targetKind === 'kit' ? 'FIRST AID' : this.targetKind === 'camp' ? 'RELIEF CAMP' : this.nearestSurvivor?.needsAid ? 'INJURED SURVIVOR' : 'SURVIVORS' };
  }
}
