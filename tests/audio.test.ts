import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { AUDIO_ASSETS, AudioManager } from '../src/game/AudioManager.ts';

function audioHarness(t: TestContext) {
  const calls = { contexts: 0, resumes: 0, closes: 0, oscillators: 0, buffers: 0, immediateStops: 0, requests: 0 };
  const storage = new Map<string, string>();
  const gains: ReturnType<typeof node>[] = [];
  const managers: AudioManager[] = [];
  function param() {
    return {
      value: 0,
      setTargetAtTime(value: number) { this.value = value; },
      setValueAtTime(value: number) { this.value = value; },
      linearRampToValueAtTime(value: number) { this.value = value; },
      exponentialRampToValueAtTime(value: number) { this.value = value; },
    };
  }
  function node() {
    return {
      gain: param(), frequency: param(), playbackRate: param(), onended: null as (() => void) | null,
      connect(next: unknown) { return next; }, disconnect() {}, start() {},
      stop(when?: number) { if (when === undefined) { calls.immediateStops++; this.onended?.(); } },
    };
  }
  class FakeAudioContext {
    sampleRate = 100; currentTime = 0; destination = node();
    constructor() { calls.contexts++; }
    createGain() { const gain = node(); gains.push(gain); return gain; }
    createBufferSource() { calls.buffers++; return node(); }
    createBiquadFilter = node;
    createOscillator() { calls.oscillators++; return node(); }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
    async resume() { calls.resumes++; }
    async close() { calls.closes++; }
  }
  const replacements = {
    AudioContext: FakeAudioContext,
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
    fetch: () => { calls.requests++; throw new Error('Default audio must not make network requests'); },
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
  return {
    calls, gains, storage,
    create() { const manager = new AudioManager(); managers.push(manager); return manager; },
  };
}

test('audio stays locked until a start gesture and null asset mappings make no requests', async t => {
  const { create, calls, gains } = audioHarness(t);
  const audio = create();
  audio.setPlaying(true); audio.update(7); audio.play('rescue'); audio.play('complete'); audio.toggle(); audio.toggle();
  assert.equal(calls.contexts, 0, 'menu actions and effects cannot create audio before unlock');
  assert.equal(calls.requests, 0);
  assert.ok(Object.values(AUDIO_ASSETS).every(path => path === null));
  await audio.unlock();
  assert.equal(calls.contexts, 1);
  assert.equal(calls.buffers, 2, 'generated rain and boat loops are available');
  assert.equal(calls.requests, 0, 'default generated audio must not fetch missing filenames');
  assert.ok(gains[1].gain.value > gains[2].gain.value, 'rain should be more prominent than boat ambience');
  await audio.unlock();
  assert.equal(calls.contexts, 1, 'restarting a level must reuse its audio context');
  assert.equal(calls.buffers, 2, 'restarting must not duplicate ambience loops');
});

test('pause and mute silence ambience and effects while completion can sound over the result screen', async t => {
  const { create, calls, gains } = audioHarness(t);
  const audio = create();
  await audio.unlock();
  assert.equal(gains[1].gain.value, 0, 'intro ambience starts silent');
  audio.setPlaying(true); audio.update(8.2); audio.play('rescue');
  assert.equal(calls.oscillators, 2);
  assert.ok(gains[1].gain.value > 0 && gains[2].gain.value > 0);
  audio.setPlaying(false);
  assert.equal(gains[1].gain.value, 0); assert.equal(gains[2].gain.value, 0);
  assert.equal(calls.immediateStops, 2, 'pause stops both active rescue tones');
  audio.play('rescue'); audio.play('thunder');
  assert.equal(calls.oscillators, 2); assert.equal(calls.buffers, 2, 'ordinary cues are suppressed while paused');
  audio.play('complete');
  assert.equal(calls.oscillators, 5, 'completion is allowed after gameplay stops');
  assert.equal(audio.toggle(), false);
  assert.equal(gains[0].gain.value, 0, 'mute must silence the master mix');
  assert.equal(calls.immediateStops, 5, 'mute also stops the completion cue');
  audio.play('complete'); assert.equal(calls.oscillators, 5);
  audio.setPlaying(true); assert.equal(gains[0].gain.value, 0, 'resuming cannot override mute');
  assert.equal(audio.toggle(), true);
  audio.play('thunder'); assert.equal(calls.buffers, 3, 'unmuted gameplay can trigger generated thunder');
});

test('audio setting is restored for the session without creating an audio context', t => {
  const { create, calls } = audioHarness(t);
  const first = create();
  assert.equal(first.enabled, true);
  first.toggle(); assert.equal(create().enabled, false);
  first.toggle(); assert.equal(create().enabled, true);
  assert.equal(calls.contexts, 0);
});

test('disposing stops sources and prevents audio reopening or new cues', async t => {
  const { create, calls } = audioHarness(t);
  const audio = create();
  await audio.unlock(); audio.setPlaying(true); audio.play('rescue');
  audio.dispose();
  assert.equal(calls.closes, 1);
  assert.equal(calls.immediateStops, 4, 'both generated loops and both active cue tones stop');
  await audio.unlock(); audio.play('complete');
  assert.equal(calls.contexts, 1); assert.equal(calls.oscillators, 2);
});
