import type { Group } from 'three';
import type { Survivor } from './Survivor';

/** Seat reservations include the boarding passenger, so a fourth person never enters. */
export class PassengerManager {
  readonly capacity = 3;
  private slots: Array<Survivor | null> = [null, null, null];
  constructor(readonly seats: readonly Group[]) {}
  get count() { return this.slots.filter(Boolean).length; }
  get full() { return this.count >= this.capacity; }
  get occupants() { return this.slots.filter((person): person is Survivor => person !== null); }
  reserve(person: Survivor): number | null {
    if (person.state !== 'WAITING' || this.full || this.slots.includes(person)) return null;
    const index = this.slots.indexOf(null);
    this.slots[index] = person;
    return index;
  }
  seatOf(person: Survivor) { const index = this.slots.indexOf(person); return index < 0 ? null : this.seats[index]; }
  release(person: Survivor) { const index = this.slots.indexOf(person); if (index >= 0) this.slots[index] = null; }
  reset() { this.slots.fill(null); }
}
