import type { Vehicle } from './VehicleTransfer';

/** Held touch controls stay separate from keyboard input so either can be released safely. */
export class TouchControls {
  readonly root = document.createElement('div');
  readonly flightRoot = document.createElement('div');
  private readonly mobile = matchMedia('(max-width: 900px), (any-pointer: coarse)');
  private readonly held = new Map<number, { code: string; button: HTMLButtonElement }>();
  private enabled = false;
  private vehicle: Vehicle = 'boat';

  constructor(container: HTMLElement) {
    this.root.className = 'mobile-controls';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Movement controls');
    this.root.hidden = true;
    this.flightRoot.className = 'mobile-flight-controls';
    this.flightRoot.setAttribute('role', 'group');
    this.flightRoot.setAttribute('aria-label', 'Helicopter altitude controls');
    this.flightRoot.hidden = true;
    const directions = [
      ['up', 'ArrowUp', 'Accelerate', 0], ['down', 'ArrowDown', 'Reverse', 180],
      ['left', 'ArrowLeft', 'Steer left', -90], ['right', 'ArrowRight', 'Steer right', 90],
    ] as const;
    for (const [direction, code, label, rotation] of directions) {
      this.addButton(this.root, direction, code, label, rotation);
    }
    this.addButton(this.flightRoot, 'rise', 'Space', 'Rise helicopter', 0, 'RISE');
    this.addButton(this.flightRoot, 'descend', 'ShiftLeft', 'Descend helicopter', 180, 'DESCEND');
    for (const group of [this.root, this.flightRoot]) {
      group.addEventListener('contextmenu', event => event.preventDefault());
    }
    // Window listeners also handle release outside a button or an interrupted touch.
    addEventListener('pointerup', event => this.release(event.pointerId));
    addEventListener('pointercancel', event => this.release(event.pointerId));
    this.mobile.addEventListener('change', () => this.setEnabled(this.enabled, this.vehicle));
    container.append(this.root, this.flightRoot);
  }

  private addButton(group: HTMLElement, direction: string, code: string, label: string, rotation: number, caption = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-arrow touch-${direction}`;
    button.setAttribute('aria-label', label);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7" transform="rotate(${rotation} 12 12)"/></svg>${caption ? `<span aria-hidden="true">${caption}</span>` : ''}`;
    button.addEventListener('pointerdown', event => {
      if (!this.enabled || !this.mobile.matches || group.hidden || event.button !== 0) return;
      event.preventDefault();
      this.held.set(event.pointerId, { code, button });
      button.dataset.pressed = 'true';
      // Synthetic events in the browser smoke test have no capturable pointer.
      if (event.isTrusted) button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('lostpointercapture', event => this.release(event.pointerId));
    group.append(button);
  }

  setEnabled(enabled: boolean, vehicle: Vehicle = 'boat') {
    this.enabled = enabled;
    this.vehicle = vehicle;
    this.clear();
    this.root.hidden = !enabled || !this.mobile.matches;
    this.flightRoot.hidden = this.root.hidden || vehicle !== 'helicopter';
  }

  isPressed(code: string) {
    for (const input of this.held.values()) if (input.code === code) return true;
    return false;
  }

  private clear() {
    for (const id of [...this.held.keys()]) this.release(id);
  }

  private release(id: number) {
    const input = this.held.get(id);
    if (!input) return;
    this.held.delete(id);
    if (!this.isPressed(input.code)) delete input.button.dataset.pressed;
    if (input.button.hasPointerCapture(id)) input.button.releasePointerCapture(id);
  }
}
