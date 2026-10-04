import type { Game } from '../src/game/Game';
import { getRescueCondition } from '../src/game/RescueMission';

/** Development-only playthrough: real key events, real motion, no teleports or state skips. */
export function runBrowserSmoke(game: Game) {
  const status = document.createElement('pre');
  status.id = 'smoke-status';
  status.style.cssText = 'position:fixed;left:20px;bottom:90px;padding:12px;background:#132729ee;color:#cff3d7;z-index:30;font:11px monospace;pointer-events:none';
  document.body.append(status);
  const keys = new Set<string>();
  const key = (code: string, active: boolean) => {
    if (keys.has(code) === active) return;
    if (active) keys.add(code); else keys.delete(code);
    window.dispatchEvent(new KeyboardEvent(active ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  const release = () => ['KeyW', 'KeyA', 'KeyD', 'Space'].forEach(code => key(code, false));
  const begun = performance.now();
  let waypoint = 0;
  let frames = 0;
  let finished = false;
  let rescueAttempted = false;
  function loop() {
    if (finished) return;
    frames++;
    const boat = game.boat.controller;
    const mission = game.mission;
    const state = mission.getHUD();
    status.textContent = `BROWSER PLAYTHROUGH · ${mission.phase}\n${state.message}\nPosition ${boat.position.x.toFixed(1)}, ${boat.position.z.toFixed(1)} · ${(boat.speed * 3.6).toFixed(1)} km/h`;
    if (performance.now() - begun > 160_000) {
      release(); finished = true; status.textContent += '\nFAIL: timed out'; console.error('[Smoke] Timed out'); return;
    }
    if (mission.phase === 'complete') {
      release(); finished = true; status.textContent += '\nPASS: navigated, boarded, delivered'; console.info(`[Smoke] Complete playthrough passed · ${Math.round(frames * 1000 / (performance.now() - begun))} fps average · ${game.renderer.info.render.calls} draw calls · ${game.renderer.info.render.triangles} triangles`); return;
    }
    if (mission.phase === 'boarding') { release(); requestAnimationFrame(loop); return; }
    if (mission.phase === 'search' && getRescueCondition(boat, game.survivor.position) === 'ready') {
      release();
      key('KeyE', true); key('KeyE', false);
      rescueAttempted = true;
      requestAnimationFrame(loop); return;
    }
    const route = mission.rescued ? [[0, 18], [24, 18]] : [[0, -17.4]];
    const point = route[waypoint];
    const dx = point[0] - boat.position.x, dz = point[1] - boat.position.z;
    const distance = Math.hypot(dx, dz);
    if (mission.rescued && waypoint === 0 && distance < 1.2 && boat.speed < 0.7) waypoint++;
    const desired = Math.atan2(-dx, -dz);
    const error = Math.atan2(Math.sin(desired - boat.yaw), Math.cos(desired - boat.yaw));
    const goal = Math.abs(error) > 0.48 ? 0 : Math.min(5.5, Math.max(0.45, distance * 0.75));
    key('KeyA', error > 0.05); key('KeyD', error < -0.05);
    key('KeyW', Math.abs(error) < 0.48 && boat.speed < goal);
    key('Space', boat.speed > goal + 0.15 || (distance < 1.2));
    if (rescueAttempted && mission.phase === 'search') {
      release(); finished = true; status.textContent += '\nFAIL: rescue did not board'; return;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
