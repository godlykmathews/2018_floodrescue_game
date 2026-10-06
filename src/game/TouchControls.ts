/** Four held directions, kept separate from keyboard input so either can be released safely. */
export class TouchControls {
  readonly root = document.createElement('div');
  private readonly mobile = matchMedia('(max-width: 900px), (any-pointer: coarse)');
  private readonly held = new Map<number, { code: string; button: HTMLButtonElement }>();
  private enabled = false;

  constructor(container: HTMLElement) {
    this.root.className = 'mobile-controls';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Movement controls');
    this.root.hidden = true;
    const directions = [
      ['up', 'ArrowUp', 'Accelerate', 0], ['down', 'ArrowDown', 'Reverse', 180],
      ['left', 'ArrowLeft', 'Steer left', -90], ['right', 'ArrowRight', 'Steer right', 90],
    ] as const;
    for (const [direction, code, label, rotation] of directions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch-arrow touch-${direction}`;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7" transform="rotate(${rotation} 12 12)"/></svg>`;
      button.addEventListener('pointerdown', event => {
        if (!this.enabled || !this.mobile.matches || event.button !== 0) return;
        event.preventDefault();
        this.held.set(event.pointerId, { code, button });
        button.dataset.pressed = 'true';
        // Synthetic events in the browser smoke test have no capturable pointer.
        if (event.isTrusted) button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('lostpointercapture', event => this.release(event.pointerId));
      this.root.append(button);
    }
    this.root.addEventListener('contextmenu', event => event.preventDefault());
    // Window listeners also handle release outside a button or an interrupted touch.
    addEventListener('pointerup', event => this.release(event.pointerId));
    addEventListener('pointercancel', event => this.release(event.pointerId));
    this.mobile.addEventListener('change', () => this.setEnabled(this.enabled));
    container.append(this.root);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.clear();
    this.root.hidden = !enabled || !this.mobile.matches;
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
