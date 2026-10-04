export type AudioEffect = 'rescue' | 'complete' | 'thunder';
type AudioName = AudioEffect | 'ambient' | 'rain' | 'boat';
type LoopName = 'ambient' | 'rain' | 'boat' | 'helicopter';
type SourceName = AudioName | 'helicopter';
type Vehicle = 'boat' | 'helicopter';

/** Set individual paths when audio files are available. Null makes no request. */
export const AUDIO_ASSETS: Record<AudioName, string | null> = {
  ambient: null, rain: null, boat: null, thunder: null, rescue: null, complete: null,
};
/** Loaded on first helicopter use, after the same START gesture as all other audio. */
export const HELICOPTER_AUDIO_ASSET = '/audio/dragon-studio-helicopter-sound-8d-372463.mp3';
export const AUDIO_VOLUMES: Record<SourceName, number> = {
  ambient: 0.035, rain: 0.14, boat: 0.045, thunder: 0.18, rescue: 0.07, complete: 0.065, helicopter: 0.075,
};
interface Loop { source: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode }
const preferenceKey = 'kerala-flood-rescue-audio';

/** Generated ambience and restrained cues; no generated background music. */
export class AudioManager {
  enabled = true;
  private context?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private playing = false;
  private speed = 0;
  private vehicle: Vehicle = 'boat';
  private helicopterRequested = false;
  private disposed = false;
  private buffers: Partial<Record<SourceName, AudioBuffer>> = {};
  private loops = new Map<LoopName, Loop>();
  private effects = new Set<AudioScheduledSourceNode>();
  private requests = new AbortController();

  constructor() {
    try { this.enabled = sessionStorage.getItem(preferenceKey) !== 'off'; } catch { /* Storage can be unavailable. */ }
  }

  /** Call directly from a START button gesture. Constructor and menus stay silent. */
  async unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        const ctx = this.context;
        this.master = ctx.createGain();
        this.master.gain.value = this.enabled ? 1 : 0;
        this.master.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.startLoop('rain', this.noise, 1900);
        this.startLoop('boat', this.noise, 250);
        for (const [name, path] of Object.entries(AUDIO_ASSETS)) {
          if (path) void this.loadAsset(name as AudioName, path);
        }
      }
      if (this.vehicle === 'helicopter') this.ensureHelicopter();
      await this.context.resume();
      this.refresh();
    } catch (error) { console.warn('[Kerala Flood Rescue] Audio unavailable; gameplay continues.', error); }
  }

  toggle() {
    this.enabled = !this.enabled;
    try { sessionStorage.setItem(preferenceKey, this.enabled ? 'on' : 'off'); } catch { /* Keep in-memory preference. */ }
    if (!this.enabled) this.stopEffects();
    this.refresh();
    return this.enabled;
  }

  setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    this.playing = playing;
    if (!playing) this.stopEffects();
    this.refresh();
  }

  setVehicle(vehicle: Vehicle) {
    if (this.disposed || this.vehicle === vehicle) return;
    this.vehicle = vehicle;
    if (vehicle === 'helicopter') this.ensureHelicopter();
    this.refresh();
  }

  private ensureHelicopter() {
    if (!this.context || this.disposed || this.helicopterRequested) return;
    this.helicopterRequested = true;
    void this.loadAsset('helicopter', HELICOPTER_AUDIO_ASSET);
  }

  update(speed: number) {
    this.speed = Math.max(0, Math.min(1, speed / 8.2));
    const boat = this.loops.get('boat'), ctx = this.context;
    if (!boat || !ctx) return;
    boat.gain.gain.setTargetAtTime(this.playing && this.vehicle === 'boat' ? AUDIO_VOLUMES.boat * (0.12 + this.speed * 0.88) : 0, ctx.currentTime, 0.15);
    boat.filter?.frequency.setTargetAtTime(250 + this.speed * 500, ctx.currentTime, 0.25);
  }

  play(name: AudioEffect) {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled || this.disposed || (!this.playing && name !== 'complete')) return;
    const buffer = this.buffers[name];
    if (buffer) {
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = buffer; gain.gain.value = AUDIO_VOLUMES[name];
      source.connect(gain).connect(this.master); this.track(source, [gain]); source.start();
    } else if (name === 'thunder') {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      source.buffer = this.noise!; source.playbackRate.value = 0.65;
      filter.type = 'lowpass'; filter.frequency.value = 160;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(AUDIO_VOLUMES.thunder, ctx.currentTime + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.4);
      source.connect(filter).connect(gain).connect(this.master);
      this.track(source, [filter, gain]); source.start(); source.stop(ctx.currentTime + 2.5);
    } else {
      const notes = name === 'rescue' ? [440, 554] : [220, 277, 330];
      notes.forEach((frequency, index) => {
        const source = ctx.createOscillator(), gain = ctx.createGain();
        const start = ctx.currentTime + index * 0.14, end = start + (name === 'complete' ? 0.8 : 0.4);
        source.type = 'sine'; source.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(AUDIO_VOLUMES[name], start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        source.connect(gain).connect(this.master!);
        this.track(source, [gain]); source.start(start); source.stop(end + 0.02);
      });
    }
  }

  private async loadAsset(name: SourceName, path: string) {
    try {
      const response = await fetch(path, { signal: this.requests.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await this.context!.decodeAudioData(await response.arrayBuffer());
      if (this.disposed) return;
      this.buffers[name] = buffer;
      if (name === 'rain' || name === 'boat' || name === 'ambient' || name === 'helicopter') this.startLoop(name, buffer);
    } catch (error) {
      if (!this.disposed) console.warn(`[Kerala Flood Rescue] Could not load audio ${path}; using available ambience/cues.`, error);
    }
  }

  private startLoop(name: LoopName, buffer: AudioBuffer, cutoff?: number) {
    const ctx = this.context!;
    const previous = this.loops.get(name);
    if (previous) { previous.source.stop(); previous.source.disconnect(); previous.gain.disconnect(); previous.filter?.disconnect(); }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = true; gain.gain.value = 0;
    let filter: BiquadFilterNode | undefined;
    if (cutoff) { filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = cutoff; source.connect(filter).connect(gain); }
    else source.connect(gain);
    gain.connect(this.master!); this.loops.set(name, { source, gain, filter }); source.start(); this.refresh();
  }

  private refresh() {
    const ctx = this.context;
    if (!ctx || this.disposed) return;
    this.master!.gain.setTargetAtTime(this.enabled ? 1 : 0, ctx.currentTime, 0.04);
    for (const [name, loop] of this.loops) {
      const activeVehicle = (name !== 'boat' || this.vehicle === 'boat') && (name !== 'helicopter' || this.vehicle === 'helicopter');
      loop.gain.gain.setTargetAtTime(this.playing && activeVehicle ? AUDIO_VOLUMES[name] : 0, ctx.currentTime, 0.15);
    }
    this.update(this.speed * 8.2);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.effects.add(source);
    source.onended = () => { this.effects.delete(source); source.disconnect(); nodes.forEach(node => node.disconnect()); };
  }
  private stopEffects() {
    for (const effect of this.effects) { try { effect.stop(); } catch { /* Already ended. */ } }
    this.effects.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.requests.abort(); this.stopEffects();
    for (const loop of this.loops.values()) { loop.source.stop(); loop.source.disconnect(); loop.gain.disconnect(); loop.filter?.disconnect(); }
    this.loops.clear(); this.master?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
  }
}
