import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { AUDIO_ASSETS, AudioManager, AUDIO_VOLUMES, HELICOPTER_AUDIO_ASSET } from '../src/game/AudioManager.ts';

const WAVES = '/audio/waves_sound.mp3';
const HELP = '/audio/help_help.mp3';
const flushAudio = () => new Promise(resolve => setImmediate(resolve));

function audioHarness(t: TestContext, options: { defer?: string[]; fail?: Record<string, 'http' | 'decode'> } = {}) {
  const calls = { contexts: 0, resumes: 0, closes: 0, oscillators: 0, buffers: 0, immediateStops: 0, requests: 0 };
  const storage = new Map<string, string>();
  const gains: ReturnType<typeof node>[] = [];
  const sources: ReturnType<typeof node>[] = [];
  const contexts: FakeAudioContext[] = [];
  const managers: AudioManager[] = [];
  const requestedPaths: string[] = [];
  const pendingDecodes = new Map<string, () => void>();
  const encodedPaths = new WeakMap<ArrayBuffer, string>();
  function param() {
    return {
      value: 0,
      setTargetAtTime(value: number) { this.value = value; },
      setValueAtTime(value: number) { this.value = value; },
      linearRampToValueAtTime(value: number) { this.value = value; },
      exponentialRampToValueAtTime(value: number) { this.value = value; },
      cancelScheduledValues() {},
    };
  }
  function node() {
    return {
      buffer: undefined as { asset: string; duration: number } | undefined,
      gain: param(), frequency: param(), playbackRate: param(), onended: null as (() => void) | null,
      connections: [] as unknown[], loop: false, loopStart: 0, loopEnd: 0,
      startArgs: [] as number[], stopped: false, disconnected: false,
      connect(next: unknown) { this.connections.push(next); return next; },
      disconnect() { this.disconnected = true; },
      start(...args: number[]) { this.startArgs = args; },
      stop(when?: number) {
        if (when === undefined && !this.stopped) {
          this.stopped = true; calls.immediateStops++; this.onended?.();
        }
      },
    };
  }
  class FakeAudioContext {
    sampleRate = 100; currentTime = 0; state = 'running'; destination = node();
    constructor() { calls.contexts++; contexts.push(this); }
    createGain() { const gain = node(); gains.push(gain); return gain; }
    createBufferSource() { calls.buffers++; const source = node(); sources.push(source); return source; }
    createBiquadFilter = node;
    createOscillator() { calls.oscillators++; return node(); }
    createBuffer(_channels: number, length: number) {
      return { asset: 'generated', duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
    }
    decodeAudioData(encoded: ArrayBuffer) {
      const path = encodedPaths.get(encoded)!;
      if (options.fail?.[path] === 'decode') return Promise.reject(new Error('Invalid audio data'));
      const buffer = { asset: path, duration: path === HELICOPTER_AUDIO_ASSET ? 10.031 : path === HELP ? 1.724 : 17.472 };
      return options.defer?.includes(path)
        ? new Promise(resolve => { pendingDecodes.set(path, () => resolve(buffer)); })
        : Promise.resolve(buffer);
    }
    async resume() { calls.resumes++; }
    async close() { calls.closes++; }
  }
  const replacements = {
    AudioContext: FakeAudioContext,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    fetch: async (path: string) => {
      calls.requests++; requestedPaths.push(path);
      const encoded = new ArrayBuffer(10); encodedPaths.set(encoded, path);
      return { ok: options.fail?.[path] !== 'http', status: options.fail?.[path] === 'http' ? 404 : 200, arrayBuffer: async () => encoded };
    },
  };
  const originals = Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const manager of managers) manager.dispose();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  function gainFor(source: ReturnType<typeof node>) {
    let connection = source.connections[0] as ReturnType<typeof node>;
    while (connection && !gains.includes(connection)) connection = connection.connections[0] as ReturnType<typeof node>;
    assert.ok(connection, 'source must route through a gain');
    return connection;
  }
  return {
    calls, gains, sources, contexts, storage, requestedPaths, gainFor,
    assetSources: (path: string) => sources.filter(source => source.buffer?.asset === path),
    finishDecode(path: string) { const finish = pendingDecodes.get(path); assert.ok(finish, `Pending decode: ${path}`); pendingDecodes.delete(path); finish(); },
    create() { const manager = new AudioManager(); managers.push(manager); return manager; },
  };
}

test('audio stays locked until a start gesture, then loads only configured files once', async t => {
  const h = audioHarness(t), audio = h.create();
  audio.setPlaying(true); audio.update(7); audio.play('rescue'); audio.play('complete'); audio.toggle(); audio.toggle();
  assert.equal(audio.playHelp(3), false);
  assert.equal(h.calls.contexts, 0, 'menu actions and effects cannot create audio before unlock');
  assert.equal(h.calls.requests, 0);
  assert.deepEqual(AUDIO_ASSETS, { ambient: null, rain: null, boat: null, thunder: null, rescue: null, complete: null, waves: WAVES, help: HELP });
  await audio.unlock(); await flushAudio();
  assert.equal(h.calls.contexts, 1);
  assert.equal(h.sources.filter(source => source.buffer?.asset === 'generated').length, 2, 'rain and boat retain generated loops');
  assert.deepEqual([...h.requestedPaths].sort(), [WAVES, HELP].sort());
  const waves = h.assetSources(WAVES)[0];
  assert.equal(waves.loop, true); assert.equal(waves.startArgs[1] ?? 0, 0, 'waves play from the start of their recording');
  assert.equal(h.gainFor(waves).gain.value, AUDIO_VOLUMES.waves);
  assert.equal(h.gainFor(h.sources[0]).gain.value, AUDIO_VOLUMES.rain);
  assert.equal(h.assetSources(HELP).length, 0, 'decoding a help recording must not play it');
  await audio.unlock(); await flushAudio();
  assert.equal(h.calls.contexts, 1, 'restarting a level must reuse its audio context');
  assert.equal(h.calls.buffers, 3, 'restarting must not duplicate ambience loops');
  assert.equal(h.calls.requests, 2, 'files are fetched once per audio manager');
});

test('pause and mute silence ambience and effects while completion can sound over the result screen', async t => {
  const h = audioHarness(t), audio = h.create();
  await audio.unlock(); await flushAudio();
  const loops = h.sources.filter(source => source.loop);
  assert.ok(loops.every(source => h.gainFor(source).gain.value === 0), 'intro ambience starts silent');
  audio.setPlaying(true); audio.update(8.2); audio.play('rescue');
  assert.equal(h.calls.oscillators, 2);
  assert.ok(loops.every(source => h.gainFor(source).gain.value > 0));
  audio.setPlaying(false);
  assert.ok(loops.every(source => h.gainFor(source).gain.value === 0));
  assert.equal(h.calls.immediateStops, 2, 'pause stops both active rescue tones');
  audio.play('rescue'); audio.play('thunder');
  assert.equal(h.calls.oscillators, 2); assert.equal(h.calls.buffers, 3, 'ordinary cues are suppressed while paused');
  audio.play('complete'); assert.equal(h.calls.oscillators, 5, 'completion is allowed after gameplay stops');
  assert.equal(audio.toggle(), false);
  assert.equal(h.gains[0].gain.value, 0, 'mute must silence the master mix');
  assert.equal(h.calls.immediateStops, 5, 'mute also stops the completion cue');
  audio.play('complete'); assert.equal(h.calls.oscillators, 5);
  audio.setPlaying(true); assert.equal(h.gains[0].gain.value, 0, 'resuming cannot override mute');
  assert.equal(audio.toggle(), true);
  audio.play('thunder'); assert.equal(h.calls.buffers, 4, 'unmuted gameplay can trigger generated thunder');
});

test('audio setting is restored for the session without creating an audio context', t => {
  const { create, calls } = audioHarness(t), first = create();
  assert.equal(first.enabled, true);
  first.toggle(); assert.equal(create().enabled, false);
  first.toggle(); assert.equal(create().enabled, true);
  assert.equal(calls.contexts, 0);
});

test('disposing stops sources and prevents audio reopening or new cues', async t => {
  const h = audioHarness(t), audio = h.create();
  await audio.unlock(); await flushAudio(); audio.setPlaying(true); audio.play('rescue');
  audio.dispose();
  assert.equal(h.calls.closes, 1);
  assert.equal(h.calls.immediateStops, 5, 'three ambience loops and both active cue tones stop');
  assert.ok(h.sources.every(source => source.stopped));
  await audio.unlock(); audio.play('complete');
  assert.equal(h.calls.contexts, 1); assert.equal(h.calls.oscillators, 2);
  assert.equal(audio.playHelp(3), false);
});

test('trimmed helicopter loop loads once after unlock and follows vehicle, pause, and mute state', async t => {
  const h = audioHarness(t), audio = h.create();
  audio.setVehicle('helicopter'); audio.setPlaying(true);
  assert.equal(h.calls.contexts, 0); assert.equal(h.calls.requests, 0, 'vehicle selection cannot bypass user gesture');
  await audio.unlock(); await flushAudio();
  assert.deepEqual([...h.requestedPaths].sort(), [WAVES, HELP, HELICOPTER_AUDIO_ASSET].sort());
  const rotor = h.assetSources(HELICOPTER_AUDIO_ASSET)[0], rotorGain = h.gainFor(rotor);
  const boatGain = h.gainFor(h.sources.filter(source => source.buffer?.asset === 'generated')[1]);
  assert.equal(rotor.loop, true); assert.equal(rotor.loopStart, 0.7); assert.equal(rotor.loopEnd, 8.5);
  assert.deepEqual(rotor.startArgs, [0, 0.7], 'the initial start skips the same faded opening as later loops');
  assert.equal(boatGain.gain.value, 0, 'boat ambience stops while piloting the helicopter');
  assert.equal(rotorGain.gain.value, AUDIO_VOLUMES.helicopter);
  const wavesGain = h.gainFor(h.assetSources(WAVES)[0]);
  assert.ok(wavesGain.gain.value > 0 && wavesGain.gain.value < AUDIO_VOLUMES.waves, 'water ambience recedes during flight');
  audio.setVehicle('boat'); assert.equal(rotorGain.gain.value, 0); assert.ok(boatGain.gain.value > 0);
  assert.equal(wavesGain.gain.value, AUDIO_VOLUMES.waves);
  audio.setVehicle('helicopter'); audio.setVehicle('helicopter');
  assert.equal(h.requestedPaths.filter(path => path === HELICOPTER_AUDIO_ASSET).length, 1, 'switching reuses the decoded rotor loop');
  audio.toggle(); assert.equal(h.gains[0].gain.value, 0, 'session mute applies to the helicopter too');
  audio.setPlaying(false); audio.toggle();
  assert.equal(rotorGain.gain.value, 0, 'unmuting while paused cannot restart rotor audio');
  audio.setPlaying(true); assert.equal(rotorGain.gain.value, AUDIO_VOLUMES.helicopter);
});

test('a helicopter download completing during pause stays silent until flight resumes', async t => {
  const h = audioHarness(t, { defer: [HELICOPTER_AUDIO_ASSET] }), audio = h.create();
  await audio.unlock(); audio.setPlaying(true); audio.setVehicle('helicopter'); await flushAudio();
  assert.equal(h.assetSources(HELICOPTER_AUDIO_ASSET).length, 0, 'rotor source is not created before decoding');
  audio.setPlaying(false); h.finishDecode(HELICOPTER_AUDIO_ASSET); await flushAudio();
  const rotorGain = h.gainFor(h.assetSources(HELICOPTER_AUDIO_ASSET)[0]);
  assert.equal(rotorGain.gain.value, 0);
  audio.setVehicle('boat'); audio.setPlaying(true);
  assert.equal(rotorGain.gain.value, 0, 'a late helicopter asset cannot play over the boat');
  audio.setVehicle('helicopter'); assert.equal(rotorGain.gain.value, AUDIO_VOLUMES.helicopter);
});

test('disposing during decoding prevents late ambience or help from starting', async t => {
  const paths = [WAVES, HELP, HELICOPTER_AUDIO_ASSET];
  const h = audioHarness(t, { defer: paths }), audio = h.create();
  await audio.unlock(); audio.setPlaying(true); audio.setVehicle('helicopter'); await flushAudio();
  audio.dispose(); paths.forEach(path => h.finishDecode(path)); await flushAudio();
  assert.equal(h.calls.buffers, 2, 'only the two original ambience sources were created');
  assert.equal(h.calls.closes, 1); assert.equal(audio.playHelp(2), false);
  audio.setVehicle('boat'); audio.setVehicle('helicopter'); await audio.unlock();
  assert.equal(h.calls.requests, 3); assert.equal(h.calls.contexts, 1);
});

test('help needs its decoded recording, nearby range, active boat gameplay, and does not overlap', async t => {
  const h = audioHarness(t, { defer: [HELP] }), audio = h.create();
  await audio.unlock(); audio.setPlaying(true); await flushAudio();
  assert.equal(audio.playHelp(2), false, 'there is no synthetic voice fallback while the file loads');
  assert.equal(h.calls.oscillators, 0);
  h.finishDecode(HELP); await flushAudio();
  audio.setPlaying(false); assert.equal(audio.playHelp(2), false);
  audio.setPlaying(true); audio.setVehicle('helicopter'); assert.equal(audio.playHelp(2), false);
  audio.setVehicle('boat');
  assert.equal(audio.playHelp(19), false); assert.equal(audio.playHelp(Infinity), false); assert.equal(audio.playHelp(NaN), false);
  h.contexts[0].state = 'suspended'; assert.equal(audio.playHelp(2), false, 'a blocked audio context must not queue a voice for later');
  h.contexts[0].state = 'running';
  assert.equal(audio.playHelp(2), true); assert.equal(audio.helpPlaying, true);
  const help = h.assetSources(HELP)[0], gain = h.gainFor(help);
  assert.equal(help.loop, false, 'a call is always a single recording');
  assert.ok(gain.gain.value > 0 && gain.gain.value <= AUDIO_VOLUMES.help);
  const nearGain = gain.gain.value;
  assert.equal(audio.playHelp(3), false); assert.equal(h.assetSources(HELP).length, 1);
  audio.updateHelpDistance(14); assert.ok(gain.gain.value < nearGain && gain.gain.value > 0, 'voice fades as the boat moves away');
  help.onended?.(); assert.equal(audio.helpPlaying, false);
  assert.equal(audio.playHelp(3), true, 'finishing a one-shot releases its overlap lock');
});

test('help cancels on leaving range, boarding, pause, mute, helicopter transfer, or disposal', async t => {
  const h = audioHarness(t), audio = h.create();
  await audio.unlock(); await flushAudio(); audio.setPlaying(true);
  for (const [reason, cancel, restore] of [
    ['range', () => audio.updateHelpDistance(19), () => {}],
    ['boarding', () => audio.updateHelpDistance(null), () => {}],
    ['pause', () => audio.setPlaying(false), () => audio.setPlaying(true)],
    ['mute', () => audio.toggle(), () => audio.toggle()],
    ['helicopter', () => audio.setVehicle('helicopter'), () => audio.setVehicle('boat')],
    ['dispose', () => audio.dispose(), () => {}],
  ] as const) {
    assert.equal(audio.playHelp(3), true, `${reason}: call begins`);
    const source = h.assetSources(HELP).at(-1)!;
    cancel(); assert.equal(audio.helpPlaying, false, `${reason}: active call clears`);
    assert.equal(source.stopped, true, `${reason}: playing recording stops immediately`);
    restore();
  }
});

test('late wave and help decodes during pause stay silent and do not trigger voices', async t => {
  const h = audioHarness(t, { defer: [WAVES, HELP] }), audio = h.create();
  await audio.unlock(); await flushAudio(); audio.setPlaying(true); audio.setPlaying(false);
  h.finishDecode(WAVES); h.finishDecode(HELP); await flushAudio();
  assert.equal(h.gainFor(h.assetSources(WAVES)[0]).gain.value, 0);
  assert.equal(h.assetSources(HELP).length, 0); assert.equal(audio.playHelp(3), false);
  audio.setPlaying(true);
  assert.equal(h.gainFor(h.assetSources(WAVES)[0]).gain.value, AUDIO_VOLUMES.waves);
  assert.equal(h.assetSources(HELP).length, 0, 'resume cannot spontaneously trigger a cry');
});

test('missing or undecodable supplied audio warns clearly while generated ambience and cues continue', async t => {
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => warnings.push(String(args[0])));
  const h = audioHarness(t, { fail: { [WAVES]: 'http', [HELP]: 'decode', [HELICOPTER_AUDIO_ASSET]: 'http' } }), audio = h.create();
  await audio.unlock(); audio.setPlaying(true); audio.setVehicle('helicopter'); await flushAudio();
  for (const path of [WAVES, HELP, HELICOPTER_AUDIO_ASSET]) assert.ok(warnings.some(warning => warning.includes(path)), `warning names ${path}`);
  assert.equal(h.calls.buffers, 2, 'generated ambience survives external audio failures');
  audio.setVehicle('boat'); assert.equal(audio.playHelp(3), false);
  audio.play('rescue'); assert.equal(h.calls.oscillators, 2, 'rescue feedback remains available');
  await audio.unlock(); audio.setVehicle('helicopter'); await flushAudio();
  assert.equal(h.calls.requests, 3, 'failed files are not requested repeatedly during vehicle switching');
});
