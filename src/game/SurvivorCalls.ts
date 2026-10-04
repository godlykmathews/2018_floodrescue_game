export interface CallPosition { x: number; y: number; z: number }
export interface CallingSurvivor { id: string; state: string; position: CallPosition }
export interface SurvivorCall { id: string; distance: number; position: CallPosition }
export const HELP_CALL_RADIUS = 18;

/** One shared voice schedule prevents nearby groups from calling over each other. */
export class SurvivorCalls {
  readonly radius = HELP_CALL_RADIUS;
  private approachDelay: number | null = null;
  private cooldown = 0;

  constructor(private readonly random: () => number = Math.random) {}

  reset() {
    this.approachDelay = null;
    this.cooldown = 0;
  }

  update(dt: number, people: readonly CallingSurvivor[], listener: CallPosition, eligible: boolean): SurvivorCall | null {
    if (!eligible) {
      // Pauses and vehicle transfers cannot accumulate a burst of overdue calls.
      this.approachDelay = null;
      return null;
    }
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.cooldown = Math.max(0, this.cooldown - elapsed);
    let nearest: CallingSurvivor | undefined;
    let nearestDistance = this.radius;
    for (const person of people) {
      if (person.state !== 'WAITING') continue;
      const distance = Math.hypot(person.position.x - listener.x, person.position.y - listener.y, person.position.z - listener.z);
      if (distance <= nearestDistance) { nearest = person; nearestDistance = distance; }
    }
    if (!nearest) {
      this.approachDelay = null;
      return null;
    }
    this.approachDelay ??= this.between(5, 9);
    this.approachDelay = Math.max(0, this.approachDelay - elapsed);
    if (this.approachDelay > 0 || this.cooldown > 0) return null;
    this.cooldown = this.between(25, 40);
    return { id: nearest.id, distance: nearestDistance, position: { ...nearest.position } };
  }

  private between(min: number, max: number) { return min + this.random() * (max - min); }
}
