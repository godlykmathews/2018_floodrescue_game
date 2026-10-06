import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { TouchControls } from '../src/game/TouchControls.ts';

// Only the DOM boundary is faked. Every input runs the production event handlers.
class ElementFixture extends EventTarget {
  className = '';
  innerHTML = '';
  type = '';
  hidden = false;
  readonly dataset: Record<string, string> = {};
  readonly children: ElementFixture[] = [];
  readonly attributes = new Map<string, string>();
  private readonly captures = new Set<number>();
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: ElementFixture[]) { this.children.push(...children); }
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
    pointer(this, 'lostpointercapture', id);
  }
}

class MediaFixture extends EventTarget {
  constructor(public matches: boolean) { super(); }
  change(matches: boolean) { this.matches = matches; this.dispatchEvent(new Event('change')); }
}

function pointer(target: EventTarget, type: string, pointerId: number, button = 0) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: pointerId }, button: { value: button } });
  target.dispatchEvent(event);
  return event;
}

function fixture(t: TestContext, mobile = true) {
  const windowEvents = new EventTarget();
  const media = new MediaFixture(mobile);
  const globals = {
    document: { createElement: () => new ElementFixture() },
    matchMedia: () => media,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const container = new ElementFixture();
  const controls = new TouchControls(container as unknown as HTMLElement);
  const root = controls.root as unknown as ElementFixture;
  const flight = controls.flightRoot as unknown as ElementFixture;
  const button = (direction: string) => {
    const found = [...root.children, ...flight.children].find(element => element.className.split(' ').includes(`touch-${direction}`));
    assert.ok(found, `missing ${direction} button`);
    return found;
  };
  return { controls, root, flight, button, media, windowEvents };
}

test('RISE and DESCEND map to altitude keys only for an enabled mobile helicopter', t => {
  const { controls, root, flight, button } = fixture(t);
  assert.equal(root.hidden, true);
  assert.equal(flight.hidden, true);
  pointer(button('up'), 'pointerdown', 1);
  assert.equal(controls.isPressed('ArrowUp'), false, 'hidden menu controls ignore input');
  controls.setEnabled(true, 'boat');
  assert.equal(root.hidden, false);
  assert.equal(flight.hidden, true);
  pointer(button('rise'), 'pointerdown', 2);
  pointer(button('descend'), 'pointerdown', 3);
  assert.equal(controls.isPressed('Space'), false, 'hidden rise must never brake the boat');
  assert.equal(controls.isPressed('ShiftLeft'), false);
  controls.setEnabled(true, 'helicopter');
  assert.equal(flight.hidden, false);
  assert.equal(pointer(button('rise'), 'pointerdown', 4).defaultPrevented, true);
  pointer(button('descend'), 'pointerdown', 5);
  assert.equal(controls.isPressed('Space'), true);
  assert.equal(controls.isPressed('ShiftLeft'), true);
  assert.equal(controls.isPressed('ShiftRight'), false);
  assert.equal(button('rise').dataset.pressed, 'true');
  assert.equal(button('descend').dataset.pressed, 'true');
});

test('different and same-button fingers release independently, including outside the controls', t => {
  const { controls, button, windowEvents } = fixture(t);
  controls.setEnabled(true, 'boat');
  pointer(button('up'), 'pointerdown', 10);
  pointer(button('right'), 'pointerdown', 11);
  pointer(windowEvents, 'pointerup', 10);
  assert.equal(controls.isPressed('ArrowUp'), false);
  assert.equal(button('up').dataset.pressed, undefined);
  assert.equal(controls.isPressed('ArrowRight'), true);
  pointer(button('right'), 'pointerdown', 12);
  pointer(windowEvents, 'pointerup', 11);
  assert.equal(controls.isPressed('ArrowRight'), true);
  assert.equal(button('right').dataset.pressed, 'true');
  pointer(windowEvents, 'pointerup', 12);
  assert.equal(controls.isPressed('ArrowRight'), false);
  assert.equal(button('right').dataset.pressed, undefined);
});

test('pointer cancellation and lost capture release altitude input without releasing another finger', t => {
  const { controls, button, windowEvents } = fixture(t);
  controls.setEnabled(true, 'helicopter');
  pointer(button('rise'), 'pointerdown', 20);
  pointer(button('descend'), 'pointerdown', 21);
  // Synthetic events do not acquire native capture; emulate the browser-owned capture.
  button('rise').setPointerCapture(20);
  pointer(windowEvents, 'pointercancel', 20);
  assert.equal(controls.isPressed('Space'), false);
  assert.equal(button('rise').dataset.pressed, undefined);
  assert.equal(button('rise').hasPointerCapture(20), false);
  assert.equal(controls.isPressed('ShiftLeft'), true);
  pointer(button('descend'), 'lostpointercapture', 21);
  assert.equal(controls.isPressed('ShiftLeft'), false);
  assert.equal(button('descend').dataset.pressed, undefined);
  assert.doesNotThrow(() => pointer(windowEvents, 'pointerup', 20), 'late release after cancellation is harmless');
});

test('pause and vehicle changes clear held altitude keys before the boat can consume Space', t => {
  const { controls, root, flight, button } = fixture(t);
  controls.setEnabled(true, 'helicopter');
  pointer(button('rise'), 'pointerdown', 30);
  pointer(button('descend'), 'pointerdown', 31);
  controls.setEnabled(false, 'helicopter');
  assert.equal(root.hidden, true);
  assert.equal(flight.hidden, true);
  assert.equal(controls.isPressed('Space'), false);
  assert.equal(controls.isPressed('ShiftLeft'), false);
  pointer(button('rise'), 'pointerdown', 32);
  controls.setEnabled(true, 'helicopter');
  assert.equal(controls.isPressed('Space'), false, 'resume cannot inherit a paused touch');
  pointer(button('rise'), 'pointerdown', 33);
  controls.setEnabled(true, 'boat');
  assert.equal(root.hidden, false);
  assert.equal(flight.hidden, true);
  assert.equal(controls.isPressed('Space'), false, 'vehicle transfer must not leave the boat braking');
  assert.equal(button('rise').dataset.pressed, undefined);
  pointer(button('rise'), 'pointerdown', 34);
  assert.equal(controls.isPressed('Space'), false, 'the hidden flight button stays inert after transfer');
  pointer(button('up'), 'pointerdown', 35);
  assert.equal(controls.isPressed('ArrowUp'), true, 'boat movement remains available');
});

test('desktop media hides and clears controls, and mobile restoration remembers the current vehicle', t => {
  const { controls, root, flight, button, media } = fixture(t, false);
  controls.setEnabled(true, 'helicopter');
  pointer(button('rise'), 'pointerdown', 40);
  pointer(button('up'), 'pointerdown', 41);
  assert.equal(root.hidden, true);
  assert.equal(flight.hidden, true);
  assert.equal(controls.isPressed('Space'), false);
  assert.equal(controls.isPressed('ArrowUp'), false);
  media.change(true);
  assert.equal(root.hidden, false);
  assert.equal(flight.hidden, false);
  pointer(button('rise'), 'pointerdown', 42);
  media.change(false);
  assert.equal(controls.isPressed('Space'), false);
  assert.equal(button('rise').dataset.pressed, undefined);
  assert.equal(flight.hidden, true);
  media.change(true);
  assert.equal(flight.hidden, false, 'helicopter controls restore after a viewport change');
  assert.equal(controls.isPressed('Space'), false);
  media.change(false);
  controls.setEnabled(true, 'boat');
  media.change(true);
  assert.equal(root.hidden, false);
  assert.equal(flight.hidden, true, 'restoration uses the latest vehicle, not the old helicopter');
});

test('touch ownership stays independent from real keyboard event ownership', t => {
  const { controls, button, windowEvents } = fixture(t);
  const keyboard = new Set<string>();
  let keyboardEvents = 0;
  windowEvents.addEventListener('keydown', event => { keyboard.add((event as KeyboardEvent).code); keyboardEvents++; });
  windowEvents.addEventListener('keyup', event => { keyboard.delete((event as KeyboardEvent).code); keyboardEvents++; });
  const key = (type: string) => {
    const event = new Event(type);
    Object.defineProperty(event, 'code', { value: 'ArrowUp' });
    windowEvents.dispatchEvent(event);
  };
  controls.setEnabled(true, 'boat');
  key('keydown');
  assert.equal(controls.isPressed('ArrowUp'), false, 'keyboard keys belong to the game, not the touch tracker');
  pointer(button('up'), 'pointerdown', 50);
  pointer(windowEvents, 'pointerup', 50);
  assert.equal(keyboard.has('ArrowUp'), true, 'releasing touch must preserve a held keyboard key');
  assert.equal(keyboardEvents, 1, 'touch must not synthesize keyboard releases');
  pointer(button('up'), 'pointerdown', 51);
  key('keyup');
  assert.equal(controls.isPressed('ArrowUp'), true, 'keyboard release must preserve a held touch');
  controls.setEnabled(false);
  assert.equal(controls.isPressed('ArrowUp'), false);
  assert.equal(keyboardEvents, 2, 'clearing touches does not dispatch keyboard events');
});

test('non-primary pointer buttons do not start movement or altitude input', t => {
  const { controls, button } = fixture(t);
  controls.setEnabled(true, 'helicopter');
  assert.equal(pointer(button('up'), 'pointerdown', 60, 2).defaultPrevented, false);
  pointer(button('rise'), 'pointerdown', 61, 1);
  assert.equal(controls.isPressed('ArrowUp'), false);
  assert.equal(controls.isPressed('Space'), false);
  assert.equal(button('up').dataset.pressed, undefined);
  assert.equal(button('rise').dataset.pressed, undefined);
});
