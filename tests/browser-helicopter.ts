import { Vector3 } from 'three';
import type { Game } from '../src/game/Game';

type Phase = 'BOAT_ROUTE' | 'TO_HELICOPTER' | 'TAKEOFF' | 'FLY_OUT' | 'PAUSE_FLIGHT' |
  'BRAKE_OUT' | 'RETURN' | 'BRAKE_PAD' | 'LAND' | 'TO_BOAT' | 'RESTART';

/** Development acceptance: real menus, keyboard input and vehicle motion; no teleports. */
export function runBrowserHelicopter(game: Game) {
  document.getElementById('helicopter-status')?.remove();
  const status = document.createElement('pre');
  status.id = 'helicopter-status';
  status.style.cssText = 'position:fixed;left:16px;bottom:90px;margin:0;padding:10px 12px;background:#132729e8;color:#cff3d7;z-index:80;font:11px/1.5 monospace;pointer-events:none';
  document.body.append(status);
  const keys = new Set<string>();
  const key = (code: string, active: boolean) => {
    if (keys.has(code) === active) return;
    if (active) keys.add(code); else keys.delete(code);
    window.dispatchEvent(new KeyboardEvent(active ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  const release = () => [...keys].forEach(code => key(code, false));
  const tap = (code: string) => { key(code, true); key(code, false); };
  function require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }
  const click = (selector: string) => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    require(button, `Missing menu control: ${selector}`); button.click();
  };
  const boat = game.boat.controller;
  const flight = game.helicopter.controller;
  const route = [[0, 39], [-29, 39]] as const;
  const start = performance.now();
  let phase: Phase = 'BOAT_ROUTE';
  let phaseStarted = start, waypoint = 0, frames = 0;
  let finished = false, pausedTested = false;
  let parkedYaw = 0, pausedTime = 0;
  let parkedBoat: Vector3 | null = null;
  let missionSnapshot = '', supplySnapshot = '';
  const pausedPosition = new Vector3();
  const pauseVelocity = new Vector3();
  const initialBoat = new Vector3(0, 0, 27);
  const results: string[] = [];
  const survivorSnapshot = () => game.mission.survivors.map(person => `${person.id}:${person.state}:${person.needsAid}`).join('|')
    + `/${game.mission.safeCount}/${game.mission.passengers.count}/${game.mission.trips}/${game.mission.integrity}`;
  const suppliesSnapshot = () => `${game.supplies.kits}/${game.supplies.coins}/${game.supplies.donated}/${game.supplies.treated}/`
    + game.supplies.items.map(item => `${item.id}:${item.collected}`).join('|');
  const advance = (next: Phase, now: number) => {
    release(); phase = next; phaseStarted = now;
    console.info(`[Helicopter playtest] ${next}`);
  };
  const report = (message: string) => { results.push(message); console.info(`[Helicopter playtest] PASS: ${message}`); };
  const sameBoat = () => {
    require(parkedBoat && boat.position.equals(parkedBoat) && boat.yaw === parkedYaw,
      'the parked boat moved or changed heading while the helicopter was active');
    require(survivorSnapshot() === missionSnapshot, 'flight changed survivor, passenger, trip or integrity state');
    require(suppliesSnapshot() === supplySnapshot, 'flight changed supplies or collected a boat pickup');
  };
  function navigateBoat() {
    const target = route[waypoint];
    const dx = target[0] - boat.position.x, dz = target[1] - boat.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.65 && boat.speed < 0.28) { release(); waypoint++; return; }
    const targetYaw = Math.atan2(-dx, -dz);
    const error = Math.atan2(Math.sin(targetYaw - boat.yaw), Math.cos(targetYaw - boat.yaw));
    const aligned = Math.abs(error) < 0.3;
    const goal = !aligned || distance < 0.55 ? 0 : Math.min(5.2, Math.max(0.45, distance * 0.82));
    key('KeyA', error > 0.035); key('KeyD', error < -0.035);
    key('KeyW', aligned && distance >= 0.55 && boat.speed < goal);
    key('Space', goal === 0 || boat.speed > goal + 0.12);
  }

  function fail(error: unknown) {
    release(); finished = true; status.dataset.result = 'fail';
    const message = error instanceof Error ? error.message : String(error);
    status.textContent += `\nFAIL · ${message}`;
    console.error('[Helicopter playtest]', error);
  }
  try {
    click('#level-select-button'); click('[data-level="2"]'); click('#level-start-button'); click('#skip-video-button'); tap('Space');
    require(game.states.state === 'PLAYING' && game.levels.current.id === 2, 'normal Level 2 menu start failed');
    require(boat.position.equals(initialBoat), 'playtest must start at the normal boat spawn');
    require(game.helicopter.visual.children.length > 0, 'helicopter render model is missing');
    require(!game.loader.warnings.some(warning => warning.includes('odz-20a')), 'supplied helicopter GLB did not load');
  } catch (error) { fail(error); return; }

  function loop(now: number) {
    if (finished) return;
    frames++;
    status.dataset.phase = phase;
    status.textContent = `HELICOPTER PLAYTEST · ${phase}\nBoat ${boat.position.x.toFixed(1)}, ${boat.position.z.toFixed(1)} · ${game.vehicles.active}\nFlight ${flight.position.x.toFixed(1)}, ${flight.position.y.toFixed(1)}, ${flight.position.z.toFixed(1)} · ${flight.speed.toFixed(1)} m/s\n${results.join(' · ')}`;
    try {
      require(now - start < 150_000, 'playtest exceeded 150 seconds');
      require(game.mission.phase !== 'failed', 'mission failed during the approach');
      if (game.paused && phase !== 'PAUSE_FLIGHT') { release(); requestAnimationFrame(loop); return; }
      if (parkedBoat && phase !== 'RESTART') sameBoat();
      switch (phase) {
        case 'BOAT_ROUTE':
          if (waypoint < route.length) navigateBoat();
          else {
            require(game.vehicles.condition(0, true) === 'ready', 'slow empty boat did not offer helicopter transfer');
            parkedBoat = boat.position.clone(); parkedYaw = boat.yaw;
            missionSnapshot = survivorSnapshot(); supplySnapshot = suppliesSnapshot();
            require(game.supplies.kits > 0, 'approach should retain the kit naturally collected at spawn basin');
            tap('KeyE');
            require(game.states.state === 'SWITCHING' && game.vehicles.destination === 'helicopter', 'E did not start boat-to-roof transfer');
            advance('TO_HELICOPTER', now);
          }
          break;
        case 'TO_HELICOPTER':
          if (!game.vehicles.switching) {
            require(game.vehicles.active === 'helicopter' && boat.locked, 'completed transfer did not activate flight and park boat');
            require(flight.landed && flight.position.equals(game.helipad.landingPosition), 'helicopter did not begin on the roof');
            report('boat → helicopter'); advance('TAKEOFF', now);
          }
          break;
        case 'TAKEOFF':
          key('Space', true);
          if (flight.altitude > 24) { require(!flight.landed && !flight.canSwitch, 'airborne helicopter can switch vehicles'); advance('FLY_OUT', now); }
          break;
        case 'FLY_OUT':
          key('KeyW', true);
          if (!pausedTested && flight.padDistance > 3) {
            release(); tap('Escape');
            require(game.states.state === 'PAUSED', 'Escape did not pause flight');
            pausedPosition.copy(flight.position); pauseVelocity.copy(flight.velocity); pausedTime = game.mission.missionTime;
            require(flight.speed > 1, 'pause must be tested during movement'); advance('PAUSE_FLIGHT', now);
          } else if (flight.padDistance > 8) advance('BRAKE_OUT', now);
          break;
        case 'PAUSE_FLIGHT':
          require(flight.position.equals(pausedPosition) && flight.velocity.equals(pauseVelocity), 'paused helicopter moved');
          require(game.mission.missionTime === pausedTime, 'paused mission clock advanced');
          if (now - phaseStarted >= 700) {
            tap('Escape'); require(game.states.state === 'PLAYING', 'Escape did not resume flight');
            pausedTested = true; report('flight + clock pause'); advance('FLY_OUT', now);
          }
          break;
        case 'BRAKE_OUT':
          key('KeyQ', true);
          if (flight.speed < 0.1 && Math.abs(flight.velocity.y) < 0.1) {
            tap('KeyE'); require(game.vehicles.active === 'helicopter' && !game.vehicles.switching, 'E switched vehicles in midair');
            report('takeoff / hover / airborne E blocked'); advance('RETURN', now);
          }
          break;
        case 'RETURN':
          key('KeyS', true);
          if (flight.padDistance < 1.8) advance('BRAKE_PAD', now);
          break;
        case 'BRAKE_PAD':
          key('KeyQ', true);
          if (flight.speed < 0.1) {
            require(flight.landingAvailable, 'return flight missed the helipad approach'); advance('LAND', now);
          }
          break;
        case 'LAND':
          key('ShiftLeft', true);
          if (flight.landed) {
            require(flight.canSwitch && flight.padDistance <= 0.35, 'landing assistance did not center the aircraft on the roof');
            require(Math.abs(flight.altitude - game.helipad.landingPosition.y) < 0.001, 'helicopter floats above or sinks into the roof');
            release(); tap('KeyE');
            require(game.vehicles.destination === 'boat' && game.states.state === 'SWITCHING', 'E did not start return-to-boat transfer');
            report('return flight + roof landing'); advance('TO_BOAT', now);
          }
          break;
        case 'TO_BOAT':
          if (!game.vehicles.switching) {
            require(game.vehicles.active === 'boat' && !boat.locked, 'return transfer did not restore boat controls');
            sameBoat(); report('parked boat + survivors + supplies preserved');
            // Reset through the actual keyboard route before another current step.
            tap('KeyR');
            require(game.states.state === 'LEVEL_INTRO', 'R did not restart the selected level');
            require(boat.position.equals(initialBoat), 'restart did not restore the boat spawn');
            require(flight.landed && flight.position.equals(game.helipad.landingPosition) && flight.velocity.length() === 0,
              'restart did not park the helicopter on its roof');
            require(game.vehicles.active === 'boat' && !game.vehicles.switching, 'restart retained the previous vehicle');
            require(game.mission.missionTime === 0 && game.mission.passengers.count === 0 && game.mission.safeCount === 0
              && game.mission.survivors.every(person => person.state === 'WAITING'), 'restart retained mission state');
            require(game.supplies.kits === 0 && game.supplies.coins === 0 && game.supplies.items.every(item => !item.collected), 'restart retained recovered supplies');
            report('restart resets both vehicles and mission'); advance('RESTART', now);
          }
          break;
        case 'RESTART': {
          tap('Space'); require(game.states.state === 'PLAYING', 'restarted level did not accept controls');
          release(); finished = true; status.dataset.result = 'pass';
          const fps = Math.round(frames * 1000 / (now - start));
          const summary = `PASS · boat → helicopter → flight → roof → boat · ${((now - start) / 1000).toFixed(1)}s · ${fps} FPS`;
          status.textContent = `${summary}\n${results.join('\n')}`;
          console.info(`[Helicopter playtest] ${summary} · ${game.renderer.info.render.calls} draw calls · ${game.renderer.info.render.triangles} triangles`);
          return;
        }
      }
      requestAnimationFrame(loop);
    } catch (error) { fail(error); }
  }
  requestAnimationFrame(loop);
}
