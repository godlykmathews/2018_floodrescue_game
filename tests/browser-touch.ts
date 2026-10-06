import type { Game } from '../src/game/Game';

/** Mobile viewport check using real DOM pointer handlers and the running boat simulation. */
export function runBrowserTouch(game: Game) {
  const panel = document.createElement('div');
  panel.id = 'touch-check';
  panel.style.cssText = 'position:fixed;right:12px;bottom:16px;z-index:30;max-width:205px;padding:10px;background:#132729ee;color:#cff3d7;font:10px monospace';
  const run = document.createElement('button');
  run.textContent = 'RUN TOUCH CHECK';
  const status = document.createElement('div');
  status.id = 'touch-check-status';
  panel.append(run, status); document.body.append(panel);
  run.onclick = async () => {
    run.hidden = true;
    const results: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) throw new Error(message);
      results.push(`PASS: ${message}`); status.innerText = results.join('\n');
    };
    const pad = document.querySelector<HTMLElement>('.mobile-controls')!;
    const arrow = (direction: string) => pad.querySelector<HTMLButtonElement>(`.touch-${direction}`)!;
    const pointer = (type: string, direction: string, id: number) => arrow(direction).dispatchEvent(
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }),
    );
    const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    try {
      check(pad.hidden, 'hidden in main menu');
      game.startLevel(2); game.skipIntro();
      check(!pad.hidden && getComputedStyle(pad).display === 'grid', 'mobile arrows visible');
      const start = game.boat.controller.position.clone();
      pointer('pointerdown', 'up', 71);
      await wait(800);
      check(game.boat.controller.position.distanceTo(start) > 0.3 && game.boat.controller.speed > 1,
        'holding up accelerates boat');
      const yaw = game.boat.controller.yaw;
      pointer('pointerdown', 'right', 72);
      await wait(600);
      check(Math.abs(game.boat.controller.yaw - yaw) > 0.08, 'two-finger steering works');
      pointer('pointerup', 'up', 71);
      check(!arrow('up').dataset.pressed && arrow('right').dataset.pressed === 'true', 'release preserves other finger');
      pointer('pointercancel', 'right', 72);
      check(!arrow('right').dataset.pressed, 'cancel releases steering');
      pointer('pointerdown', 'left', 73); pointer('pointerdown', 'left', 74);
      pointer('pointerup', 'left', 73);
      check(arrow('left').dataset.pressed === 'true', 'same-arrow touches release independently');
      pointer('lostpointercapture', 'left', 74);
      check(!arrow('left').dataset.pressed, 'lost capture releases input');
      pointer('pointerdown', 'down', 75);
      key('keydown', 'Escape');
      const pausedAt = game.boat.controller.position.clone();
      await wait(250);
      check(pad.hidden && !pad.querySelector('[data-pressed]') && game.boat.controller.position.equals(pausedAt),
        'pause hides and clears arrows');
      game.resume();
      pointer('pointerdown', 'up', 76);
      window.dispatchEvent(new Event('blur'));
      check(pad.hidden && !pad.querySelector('[data-pressed]'), 'focus loss clears touches');
      window.dispatchEvent(new Event('focus'));
      game.restart(); game.skipIntro();
      key('keydown', 'KeyW');
      pointer('pointerdown', 'up', 77); pointer('pointerup', 'up', 77);
      await wait(650);
      check(game.boat.controller.speed > 1, 'touch release preserves keyboard');
      key('keyup', 'KeyW');
      pointer('pointerdown', 'down', 78);
      game.restart(); game.skipIntro();
      check(!pad.querySelector('[data-pressed]'), 'restart clears touches');
      pointer('pointerdown', 'down', 79);
      await wait(700);
      check(game.boat.controller.velocity.dot(game.boat.controller.forward) < -0.5, 'holding down reverses boat');
      pointer('pointerup', 'down', 79);
      game.restart(); game.skipIntro();
      status.innerText = `ALL ${results.length} TOUCH CHECKS PASSED`;
      console.info('[Touch playtest]', results.join(' | '));
    } catch (error) {
      status.innerText += `\nFAIL: ${error instanceof Error ? error.message : error}`;
      console.error('[Touch playtest]', error);
    } finally { key('keyup', 'KeyW'); }
  };
}
