import type { Game } from '../src/game/Game';

/** Mobile input checks against the live simulation. Rescue/flight use placement fixtures,
 * not route-navigation acceptance; every gameplay action still goes through the DOM. */
export function runBrowserTouch(game: Game) {
  const panel = document.createElement('div');
  panel.id = 'touch-check';
  panel.style.cssText = 'position:fixed;right:12px;top:170px;z-index:30;max-width:220px;padding:8px;background:#132729ee;color:#cff3d7;font:10px monospace';
  const run = document.createElement('button');
  run.textContent = 'RUN TOUCH CHECK';
  const status = document.createElement('div');
  status.id = 'touch-check-status';
  panel.append(run, status); document.body.append(panel);
  run.onclick = async () => {
    run.hidden = true;
    panel.style.pointerEvents = 'none';
    panel.dataset.state = 'running';
    const results: string[] = [];
    const check = (condition: boolean, message: string) => {
      if (!condition) throw new Error(message);
      results.push(`PASS: ${message}`);
      status.innerText = `${results.length} passed · ${message}`;
      panel.dataset.results = JSON.stringify(results);
    };
    const pad = document.querySelector<HTMLElement>('.mobile-controls')!;
    const arrow = (direction: string) => pad.querySelector<HTMLButtonElement>(`.touch-${direction}`)!;
    const pointer = (type: string, direction: string, id: number) => arrow(direction).dispatchEvent(
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }),
    );
    const key = (type: string, code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const frames = async () => {
      for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    };
    const until = async (condition: () => boolean, message: string, timeout = 4500) => {
      const deadline = performance.now() + timeout;
      while (!condition()) {
        if (performance.now() >= deadline) throw new Error(`Timed out: ${message}`);
        await wait(40);
      }
      await frames();
    };
    const flightPad = document.querySelector<HTMLElement>('.mobile-flight-controls')!;
    const flightArrow = (direction: 'rise' | 'descend') => flightPad.querySelector<HTMLButtonElement>(`.touch-${direction}`)!;
    const flightPointer = (type: string, direction: 'rise' | 'descend', id: number) => flightArrow(direction).dispatchEvent(
      new PointerEvent(type, { pointerId: id, pointerType: 'touch', button: 0, bubbles: true, cancelable: true }),
    );
    // These bounded fixtures bypass travel only, never mission or vehicle transitions.
    const placeBoat = (x: number, z: number, yaw = 0, speed = 0) => {
      const boat = game.boat.controller;
      boat.position.set(x, 0, z); boat.yaw = yaw; boat.turnVelocity = 0;
      boat.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      boat.velocity.copy(boat.forward).multiplyScalar(speed);
      game.boat.update(0);
    };
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
      await frames();

      const context = document.querySelector<HTMLButtonElement>('#context')!;
      const actionable = () => context instanceof HTMLButtonElement && !context.disabled && getComputedStyle(context).display !== 'none';
      check(flightPad.hidden, 'altitude buttons hidden while driving boat');
      check(context instanceof HTMLButtonElement, 'context prompt is a native action button');
      const injured = game.survivors.active.find(person => person.needsAid && person.locationId === 'A');
      if (!injured) throw new Error('Level 2 fixture needs an injured terrace survivor');
      console.info('[Touch playtest] Rescue/flight checks use bounded placement fixtures; they do not prove route navigation.');
      placeBoat(0, 27); await frames();
      context.click();
      check(context.disabled && game.mission.phase === 'search', 'out-of-range prompt cannot trigger rescue');

      // Collect a real floating kit at its location rather than seeding inventory.
      const kit = game.supplies.items.find(item => item.kind === 'kit' && !item.collected)!;
      placeBoat(kit.position.x, kit.position.z); await frames();
      check(kit.collected && game.supplies.kits > 0, 'kit placement fixture collects through live simulation');
      placeBoat(injured.position.x, injured.position.z + 4, 0, 2.3); await frames();
      context.click();
      check(context.disabled && /SLOW DOWN/.test(context.textContent ?? '') && game.mission.phase === 'search',
        'unsafe-speed prompt is disabled and rejects interaction');
      placeBoat(injured.position.x, injured.position.z + 4); await frames();
      check(actionable() && /GIVE FIRST AID/.test(context.textContent ?? ''), 'injured survivor offers clickable first aid');
      const kitsBefore = game.supplies.kits;
      context.click(); context.click(); await frames();
      check(game.mission.phase === 'treating' && context.disabled && game.supplies.treatmentKit.visible,
        'context click starts visible treatment and blocks duplicate taps');
      await until(() => injured.health === 'TREATED' && game.states.state === 'PLAYING', 'first aid completes');
      check(game.supplies.kits === kitsBefore - 1 && game.supplies.treated === 1,
        'treatment consumes exactly one kit');
      check(actionable() && /RESCUE/.test(context.textContent ?? ''), 'treated survivor offers clickable rescue');
      const beforeBoarding = injured.character.position.clone();
      context.click(); context.click(); await frames();
      check(game.mission.phase === 'boarding' && context.disabled && game.mission.passengers.count === 1,
        'rescue click reserves one passenger and blocks duplicate taps');
      await wait(450);
      check(injured.character.visible && injured.root.visible && injured.character.position.distanceTo(beforeBoarding) > 0.03,
        'boarding passenger moves visibly through live frames');
      await until(() => injured.state === 'PASSENGER' && game.states.state === 'PLAYING', 'boarding completes');
      check(injured.character.parent === game.mission.passengers.seatOf(injured) && game.mission.passengers.count === 1,
        'rescued passenger is attached to a boat seat');

      placeBoat(24, 19.5, Math.PI); await frames();
      check(actionable() && /DISEMBARK/.test(context.textContent ?? ''), 'camp fixture offers clickable passenger unloading');
      context.click(); context.click(); await frames();
      check(game.mission.phase === 'unloading' && context.disabled, 'unload click starts one disembark sequence');
      await until(() => injured.state === 'SAFE' && game.states.state === 'PLAYING', 'passenger reaches safety');
      check(game.mission.safeCount === 1 && game.mission.passengers.count === 0 && injured.character.parent === injured.root,
        'unloaded survivor becomes SAFE at camp');

      placeBoat(game.helipad.dockPosition.x, game.helipad.dockPosition.z); await frames();
      check(actionable() && /BOARD HELICOPTER/.test(context.textContent ?? ''), 'helipad dock fixture offers clickable helicopter boarding');
      context.click(); context.click(); await frames();
      check(game.vehicles.switching && context.disabled && flightPad.hidden, 'helicopter transfer blocks duplicate taps and altitude input');
      await until(() => game.vehicles.active === 'helicopter' && !game.vehicles.switching, 'helicopter transfer completes');
      check(!flightPad.hidden && getComputedStyle(flightPad).display !== 'none', 'altitude buttons appear in helicopter');
      const flight = game.helicopter.controller;
      const groundAltitude = flight.altitude;
      flightPointer('pointerdown', 'rise', 80);
      await wait(650);
      check(flight.altitude > groundAltitude + 0.6 && !flight.landed, 'holding RISE increases helicopter altitude');
      flightPointer('pointercancel', 'rise', 80);
      const cancelVelocity = flight.velocity.y;
      await wait(500);
      check(!flightArrow('rise').dataset.pressed && flight.velocity.y < cancelVelocity * 0.4,
        'pointer cancel releases RISE and vertical acceleration');
      flightPointer('pointerdown', 'rise', 81);
      key('keydown', 'Escape');
      const pausedFlight = flight.position.clone();
      await wait(200);
      check(flightPad.hidden && !flightPad.querySelector('[data-pressed]') && flight.position.equals(pausedFlight),
        'pause hides altitude buttons and freezes flight');
      game.resume(); await frames();
      check(!flightPad.hidden && !flightPad.querySelector('[data-pressed]'), 'resume restores altitude buttons without stale touches');
      const highAltitude = flight.altitude;
      flightPointer('pointerdown', 'descend', 82);
      await wait(700);
      check(flight.altitude < highAltitude - 0.4, 'holding DESCEND lowers helicopter');
      await until(() => flight.landed && flight.canSwitch, 'descending lands on helipad', 5000);
      flightPointer('pointerup', 'descend', 82); await frames();
      check(actionable() && /RETURN TO BOAT/.test(context.textContent ?? ''), 'landing offers clickable return to boat');
      // Start holding rise and switch in the same event turn: transfer must clear Space.
      flightPointer('pointerdown', 'rise', 83);
      context.click(); await frames();
      check(game.vehicles.switching && flightPad.hidden && !flightPad.querySelector('[data-pressed]'),
        'return transfer clears held altitude input immediately');
      await until(() => game.vehicles.active === 'boat' && !game.vehicles.switching, 'return to boat completes');
      check(flightPad.hidden && game.mission.safeCount === 1, 'boat return hides altitude controls and preserves rescue');
      placeBoat(0, 27); await frames();
      pointer('pointerdown', 'up', 84);
      await wait(800);
      check(game.boat.controller.speed > 1.7, 'former RISE touch does not remain as the boat brake');
      pointer('pointerup', 'up', 84);
      game.restart(); game.skipIntro();
      status.innerText = `ALL ${results.length} TOUCH CHECKS PASSED`;
      panel.dataset.state = 'passed';
      console.info('[Touch playtest]', results.join(' | '));
    } catch (error) {
      status.innerText += `\nFAIL: ${error instanceof Error ? error.message : error}\nViewport ${innerWidth}×${innerHeight}; paused ${game.paused}; document hidden ${document.hidden}; pad hidden ${pad.hidden}; display ${getComputedStyle(pad).display}`;
      panel.dataset.state = 'failed';
      console.error('[Touch playtest]', error);
    } finally {
      key('keyup', 'KeyW');
      for (const id of [71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84]) {
        window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true }));
      }
    }
  };
}
