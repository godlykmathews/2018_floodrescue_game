import type { Game } from '../src/game/Game';

interface SourceRecord {
  source: AudioBufferSourceNode;
  gain?: GainNode;
  duration: number;
  loop: boolean;
  peak: number;
  stopped: boolean;
}

/** Positioned audio fixture, not a navigation playthrough. Uses the real frame scheduler and audio device. */
export function runBrowserAudio(game: Game) {
  document.getElementById('audio-status')?.remove();
  document.getElementById('run-audio-check')?.remove();
  const status = document.createElement('pre');
  status.id = 'audio-status';
  status.style.cssText = 'position:fixed;left:16px;bottom:90px;max-width:calc(100vw - 32px);white-space:pre-wrap;margin:0;padding:12px;background:#132729ee;color:#cff3d7;z-index:90;font:11px/1.5 monospace;pointer-events:none';
  status.textContent = 'AUDIO FIXTURE · waiting for a real click\nPositioned checks, not a mission playthrough. About 60–75 seconds.';
  const button = document.createElement('button');
  button.id = 'run-audio-check'; button.textContent = 'RUN AUDIO CHECK';
  button.style.cssText = 'position:fixed;left:16px;bottom:24px;z-index:100;padding:16px 24px;background:#ecba70;color:#132729;border:0;font:700 14px sans-serif;cursor:pointer';
  document.body.append(status, button);

  button.addEventListener('click', async event => {
    if (!event.isTrusted) { status.textContent = 'Click RUN AUDIO CHECK directly to unlock browser audio.'; return; }
    button.remove();
    const audio = game.audio, boat = game.boat.controller;
    const results: string[] = [], sources: SourceRecord[] = [], gains: GainNode[] = [];
    const calls: { time: number; distance: number }[] = [];
    const started = performance.now();
    const originallyEnabled = audio.enabled;
    const originalCreateSource = AudioContext.prototype.createBufferSource;
    const originalCreateGain = AudioContext.prototype.createGain;
    const originalPlayHelp = audio.playHelp;
    let phase = 'START';
    const draw = () => {
      status.dataset.phase = phase;
      status.textContent = `AUDIO FIXTURE · ${phase} · ${((performance.now() - started) / 1000).toFixed(1)}s\nHelp calls: ${calls.length} · ${game.states.state}\n${results.join('\n')}`;
    };
    function require(condition: unknown, message: string) { if (!condition) throw new Error(message); }
    const report = (message: string) => { results.push(`PASS · ${message}`); console.info(`[Audio fixture] ${message}`); draw(); };
    const setPhase = (next: string) => { phase = next; draw(); };
    const waitUntil = (condition: () => boolean, timeout: number, message: string) => new Promise<void>((resolve, reject) => {
      const began = performance.now();
      const frame = () => {
        draw();
        if (condition()) { resolve(); return; }
        if (performance.now() - began > timeout || performance.now() - started > 90_000) { reject(new Error(message)); return; }
        requestAnimationFrame(frame);
      };
      frame();
    });
    const wait = (ms: number) => { const until = performance.now() + ms; return waitUntil(() => performance.now() >= until, ms + 2000, 'Timed wait failed'); };
    const tapEscape = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    const park = (near: boolean) => {
      boat.locked = true; boat.velocity.set(0, 0, 0);
      boat.position.set(near ? 0 : -75, 0, near ? -17 : 75);
      game.cameraController.update(0, boat, true);
    };
    const matching = (duration: number) => sources.filter(source => Math.abs(source.duration - duration) < 0.2);

    // Observe real nodes; no replacement audio buffers, timers, or production debug APIs.
    AudioContext.prototype.createGain = function () {
      const gain = originalCreateGain.call(this); gains.push(gain); return gain;
    };
    AudioContext.prototype.createBufferSource = function () {
      const source = originalCreateSource.call(this);
      const start = source.start, stop = source.stop;
      let record: SourceRecord | undefined;
      source.start = function (...args: Parameters<AudioBufferSourceNode['start']>) {
        const buffer = source.buffer;
        let peak = 0;
        if (buffer) {
          const samples = buffer.getChannelData(0), stride = Math.max(1, Math.floor(samples.length / 512));
          for (let i = 0; i < samples.length; i += stride) peak = Math.max(peak, Math.abs(samples[i]));
        }
        record = { source, gain: gains.at(-1), duration: buffer?.duration ?? 0, loop: source.loop, peak, stopped: false };
        sources.push(record);
        start.apply(source, args);
      };
      source.stop = function (...args: Parameters<AudioBufferSourceNode['stop']>) {
        if (record) record.stopped = true;
        stop.apply(source, args);
      };
      return source;
    };
    audio.playHelp = (distance: number) => {
      const played = originalPlayHelp.call(audio, distance);
      if (played) calls.push({ time: game.mission.missionTime, distance });
      return played;
    };

    try {
      if (!audio.enabled) audio.toggle();
      game.startLevel(2); game.skipIntro(); park(false);
      require(game.states.state === 'PLAYING', 'Level 2 did not enter gameplay');
      const farStarted = game.mission.missionTime;
      setPhase('FAR / DECODED AMBIENCE');
      await waitUntil(() => matching(17.47).length === 1, 8000, 'Supplied wave recording did not decode/start');
      const waves = matching(17.47)[0];
      require(waves.loop && waves.peak > 0.000001, 'Wave loop is silent or not looping');
      report(`Real waves ${waves.duration.toFixed(2)}s decoded, nonzero samples, looping`);

      audio.setVehicle('helicopter');
      await waitUntil(() => matching(10.03).length === 1, 8000, 'Supplied helicopter recording did not decode/start');
      const rotor = matching(10.03)[0];
      await wait(450);
      require(rotor.loop && rotor.peak > 0.000001 && (rotor.gain?.gain.value ?? 0) > 0.1, 'Rotor loop is silent or not active');
      require(rotor.source.loopStart > 0 && rotor.source.loopEnd < rotor.duration, 'Rotor does not loop its steady middle');
      for (let i = 0; i < 4; i++) { audio.setVehicle('boat'); audio.setVehicle('helicopter'); }
      require(matching(10.03).length === 1, 'Switching vehicles duplicated the rotor source');
      audio.setVehicle('boat');
      await wait(700);
      require((rotor.gain?.gain.value ?? 1) < 0.004, 'Rotor continued at full volume after returning to boat');
      report(`Real rotor ${rotor.duration.toFixed(2)}s decoded; one reusable loop, boat transfer fades it out`);

      await waitUntil(() => game.mission.missionTime - farStarted >= 10, 12_000, 'Far-range observation did not advance');
      require(calls.length === 0 && !audio.helpPlaying, 'Help played while every survivor was far away');
      report('Ten gameplay seconds outside survivor range: no help');

      park(true); const nearStarted = game.mission.missionTime;
      setPhase('NEAR / FIRST RANDOM CALL');
      await waitUntil(() => calls.length >= 1, 12_000, 'No nearby help call within its 5–9 second window');
      const initialDelay = calls[0].time - nearStarted;
      require(initialDelay >= 4.9 && initialDelay <= 9.1 && calls[0].distance < 6, 'First call ignored its nearby randomized delay');
      const help = matching(1.72)[0];
      require(help && !help.loop && help.peak > 0.000001, 'Help recording is missing, silent, or looped');
      report(`Real help ${help.duration.toFixed(2)}s; first nearby call after ${initialDelay.toFixed(1)}s`);

      setPhase('NEAR / SPARSE REPEAT');
      await waitUntil(() => calls.length >= 2, 44_000, 'Second help call did not follow the randomized cooldown');
      const interval = calls[1].time - calls[0].time;
      require(calls.length === 2 && interval >= 24.9 && interval <= 40.1, 'Help repeated too frequently or outside its cooldown');
      require(audio.helpPlaying, 'Second recorded help call was not active');
      report(`Nearby repeat spaced ${interval.toFixed(1)}s apart`);
      park(false); await wait(100);
      require(!audio.helpPlaying && matching(1.72).at(-1)?.stopped, 'Leaving range did not stop the current voice');
      report('Leaving survivor range immediately stops the current voice');

      setPhase('MUTE / PAUSE');
      audio.toggle(); await wait(350);
      require(!audio.enabled && !audio.playHelp(4) && (gains[0]?.gain.value ?? 1) < 0.001, 'Mute did not silence the master mix and help');
      audio.toggle();
      tapEscape(); const pausedTime = game.mission.missionTime;
      await wait(850);
      require(game.states.state === 'PAUSED' && game.mission.missionTime === pausedTime, 'Pause advanced mission time');
      require(!audio.playHelp(4) && !audio.helpPlaying, 'Paused game allowed help');
      require(sources.filter(source => source.loop).every(source => (source.gain?.gain.value ?? 1) < 0.002), 'Pause left an ambience loop audible');
      tapEscape(); require(game.states.state === 'PLAYING', 'Pause did not resume');
      report('Mute silences the mix; pause silences loops/help and freezes mission time');

      setPhase('BOARDING / SAFE SURVIVORS');
      game.startLevel(2); game.skipIntro(); park(true);
      const terrace = game.survivors.active.filter(person => person.locationId === 'A');
      require(terrace.length === 2, 'Level 2 terrace fixture changed');
      terrace[0].state = 'BOARDING'; terrace[1].state = 'SAFE';
      const stateStarted = game.mission.missionTime;
      await waitUntil(() => game.mission.missionTime - stateStarted >= 9.5, 12_000, 'Survivor state observation did not advance');
      require(calls.length === 2 && !audio.helpPlaying, 'Boarding or safe survivors called for rescue');
      report('Fresh scheduler: nearby boarding/safe survivors stay silent');
      status.dataset.result = 'PASS';
      phase = 'PASS'; draw();
      console.info('[Audio fixture] PASS', JSON.stringify({ calls, decoded: sources.filter(source => source.duration !== 3).map(source => ({ duration: source.duration, loop: source.loop, peak: source.peak })), elapsed: (performance.now() - started) / 1000 }));
    } catch (error) {
      status.dataset.result = 'FAIL';
      phase = 'FAIL'; results.push(error instanceof Error ? error.message : String(error)); draw();
      console.error('[Audio fixture]', error);
    } finally {
      AudioContext.prototype.createBufferSource = originalCreateSource;
      AudioContext.prototype.createGain = originalCreateGain;
      audio.playHelp = originalPlayHelp;
      if (audio.enabled !== originallyEnabled) audio.toggle();
      game.mainMenu();
    }
  });
}
