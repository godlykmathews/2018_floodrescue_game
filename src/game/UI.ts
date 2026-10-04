export interface HUDState {
  objective: string;
  detail: string;
  message: string;
  hint: string;
  ready: boolean;
  rescued: boolean;
  completed: boolean;
  distance: number;
}

export class UI {
  readonly target: HTMLDivElement;
  private speed: HTMLElement;
  private objective: HTMLElement;
  private detail: HTMLElement;
  private message: HTMLElement;
  private hint: HTMLElement;
  private context: HTMLElement;
  private complete: HTMLElement;
  private loading: HTMLElement;
  private progress: HTMLElement;
  private phase: HTMLElement;
  private count: HTMLElement;
  private camera: HTMLElement;
  private currentStatus = '';

  constructor(container: HTMLElement, restart: () => void) {
    container.insertAdjacentHTML('beforeend', `
      <div class="scene-shade" aria-hidden="true"></div>
      <header class="top">
        <div class="identity"><div class="eyebrow"><span class="status-dot"></span> KERALA · AUGUST 2018</div><h1>KERALA <span>FLOOD RESCUE</span></h1><div class="mission-objective"><span class="objective-number">01</span><div><small>OBJECTIVE</small><p id="objective">Rescue the stranded survivor</p><p id="objective-detail" class="muted">Follow the amber marker</p></div></div></div>
        <div class="telemetry"><div class="weather">MONSOON <span>●</span> HEAVY RAIN</div><div class="speed-readout"><span id="speed">0</span><div><small>KM/H</small><span>BOAT SPEED</span></div></div><div class="passenger-count"><span class="person-icon">♙</span><span id="rescued-count">0 / 1</span> <small>ABOARD</small></div></div>
      </header>
      <div id="world-target" class="world-target"><div class="target-glyph">!</div><div class="target-label">SURVIVOR <span id="target-distance"></span></div></div>
      <div id="context" class="context"><div class="context-symbol">↗</div><div><div id="context-message">FIND THE STRANDED SURVIVOR</div><p id="context-hint">W / A / S / D to navigate · Hold Space to slow down</p></div></div>
      <footer class="bottom"><span class="field-note">FLOOD RESPONSE <b>01</b></span><div class="controls"><span><kbd>W A S D</kbd> Navigate</span><span><kbd>SPACE</kbd> Brake</span><span><kbd>E</kbd> Rescue</span><span><kbd>C</kbd> Camera</span><span><kbd>R</kbd> Restart</span></div><span id="camera-mode">CHASE CAMERA</span></footer>
      <div id="complete" class="completion hidden" role="dialog" aria-modal="true" aria-labelledby="complete-heading"><div class="complete-card"><div class="complete-icon">✓</div><small>SAFE AT THE RELIEF CAMP</small><h2 id="complete-heading">MISSION<br>COMPLETE</h2><p>You brought someone home to safety.</p><div class="result"><span>PEOPLE RESCUED</span><strong>1</strong></div><button id="restart-button">RESTART MISSION <span>↗</span></button><p class="restart-hint">or press R to head out again</p></div></div>
      <div id="loading" class="loading"><div><small>KERALA · FLOOD RESPONSE</small><h2>EVERY RESCUE<br>MATTERS.</h2><div class="loading-track"><div id="loading-progress"></div></div><p id="loading-phase">Preparing your boat…</p></div></div>
      <span id="status-announcer" class="sr-only" role="status" aria-live="polite"></span>
      <div id="pause-notice" class="pause-notice hidden" role="status"><strong id="pause-title">PAUSED</strong><span id="pause-detail"></span></div>
    `);
    const get = (id: string) => document.getElementById(id)!;
    this.target = get('world-target') as HTMLDivElement;
    this.speed = get('speed'); this.objective = get('objective'); this.detail = get('objective-detail');
    this.message = get('context-message'); this.hint = get('context-hint'); this.context = get('context');
    this.complete = get('complete'); this.loading = get('loading'); this.progress = get('loading-progress');
    this.phase = get('loading-phase'); this.count = get('rescued-count'); this.camera = get('camera-mode');
    get('restart-button').addEventListener('click', restart);
  }
  setLoading(message: string, fraction: number) {
    this.phase.textContent = message;
    this.progress.style.width = `${Math.round(Math.max(0.03, fraction) * 100)}%`;
  }
  loaded() { this.loading.classList.add('hidden'); }
  fail(message: string) { this.loading.classList.remove('hidden'); this.phase.textContent = message; }
  setPaused(reason: 'focus' | 'graphics' | null) {
    document.getElementById('pause-notice')!.classList.toggle('hidden', reason === null);
    document.getElementById('pause-title')!.textContent = reason === 'graphics' ? 'RESTORING THE VIEW…' : 'PAUSED';
    document.getElementById('pause-detail')!.textContent = reason === 'graphics'
      ? 'Your mission is paused while the view recovers.'
      : 'Return to the game to continue.';
  }
  update(speed: number, overview: boolean, state: HUDState) {
    this.speed.textContent = Math.round(speed * 3.6).toString();
    this.camera.textContent = overview ? 'OVERVIEW CAMERA' : 'CHASE CAMERA';
    this.objective.textContent = state.objective;
    this.detail.textContent = state.detail;
    this.message.textContent = state.message;
    this.hint.textContent = state.hint;
    this.context.classList.toggle('ready', state.ready);
    this.context.classList.toggle('hidden', state.completed);
    this.complete.classList.toggle('hidden', !state.completed);
    this.count.textContent = state.rescued ? '1 / 1' : '0 / 1';
    this.target.classList.toggle('camp-target', state.rescued);
    this.target.querySelector('.target-label')!.innerHTML = `${state.rescued ? 'RELIEF CAMP' : 'SURVIVOR'} <span>${Math.round(state.distance)} m</span>`;
    this.target.querySelector('.target-glyph')!.textContent = state.rescued ? '+' : '!';
    if (state.message !== this.currentStatus) {
      document.getElementById('status-announcer')!.textContent = state.message;
      this.currentStatus = state.message;
      if (state.completed) document.getElementById('restart-button')!.focus();
    }
  }
}
