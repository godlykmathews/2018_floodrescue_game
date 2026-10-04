import type { Game } from '../src/game/Game';

/** Real WebGL loss/recovery and focus checks, available only in Vite development. */
export async function runBrowserRecovery(game: Game) {
  const status = document.createElement('pre');
  status.id = 'recovery-status';
  status.style.cssText = 'position:fixed;left:20px;bottom:90px;padding:12px;background:#132729ee;color:#cff3d7;z-index:30;font:11px monospace;pointer-events:none';
  document.body.append(status);
  const results: string[] = [];
  const report = (message: string) => { results.push(message); status.textContent = results.join('\n'); };
  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const key = (down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: 'KeyW', bubbles: true }));
  const boat = game.boat.controller;
  try {
    game.startLevel(2); game.skipIntro();
    window.dispatchEvent(new Event('focus'));
    key(true);
    await wait(700);
    const beforePause = boat.position.clone();
    const timeBeforePause = game.mission.missionTime;
    const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    escape();
    await wait(500);
    report(`${boat.position.distanceTo(beforePause) < 0.001 && game.mission.missionTime === timeBeforePause && game.states.state === 'PAUSED' ? 'PASS' : 'FAIL'}: Escape pauses boat and mission time`);
    escape();
    report(`${game.states.state === 'PLAYING' ? 'PASS' : 'FAIL'}: Escape resumes the mission`);
    const beforeBlur = boat.position.clone();
    window.dispatchEvent(new Event('blur'));
    await wait(500);
    report(`${boat.position.distanceTo(beforeBlur) < 0.001 ? 'PASS' : 'FAIL'}: focus loss freezes boat motion`);
    window.dispatchEvent(new Event('focus'));
    key(false);
    key(true);
    await wait(450);
    const extension = game.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) { report('SKIP: browser does not expose context-loss testing'); return; }
    const lost = new Promise<void>(resolve => game.renderer.domElement.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    game.renderer.forceContextLoss();
    await lost;
    const beforeLoss = boat.position.clone();
    const speedAtLoss = boat.speed;
    await wait(650);
    report(`${boat.position.distanceTo(beforeLoss) < 0.001 ? 'PASS' : 'FAIL'}: graphics loss freezes boat motion`);
    const restored = new Promise<void>(resolve => game.renderer.domElement.addEventListener('webglcontextrestored', () => resolve(), { once: true }));
    game.renderer.forceContextRestore();
    await Promise.race([restored, wait(6000).then(() => { throw new Error('Graphics recovery timed out'); })]);
    await wait(700);
    report(`${!game.paused && boat.speed < speedAtLoss * 0.9 ? 'PASS' : 'FAIL'}: stale throttle cleared after recovery`);
    key(false);
    game.restart(); game.skipIntro();
    const afterRecovery = boat.position.clone();
    key(true);
    await wait(600);
    key(false);
    report(`${boat.position.distanceTo(afterRecovery) > 0.2 ? 'PASS' : 'FAIL'}: boat responds after graphics recovery`);
    game.restart(); game.skipIntro();
    console.info('[Recovery playtest]', results.join(' | '));
  } catch (error) {
    report(`FAIL: ${error instanceof Error ? error.message : error}`);
    console.error('[Recovery playtest]', error);
  } finally { key(false); }
}
