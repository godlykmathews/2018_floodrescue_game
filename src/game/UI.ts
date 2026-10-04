import type { GameState } from './GameStateManager';
import { LEVELS, missionRating, type LevelConfig } from './LevelManager';

export interface HUDState {
  objective: string; detail: string; message: string; hint: string;
  ready: boolean; rescued: boolean; completed: boolean; distance: number;
  passengers: number; total: number; safe: number; remaining: number;
  integrity: number; time: number; trips: number; failed: boolean; targetIsCamp: boolean;
  kits?: number; coins?: number; donated?: number; treated?: number; injured?: number;
  targetLabel?: string; targetKind?: 'survivor' | 'camp' | 'kit' | 'helipad'; notice?: string;
  vehicle?: 'boat' | 'helicopter'; altitude?: number; vehicleHint?: string;
}

export interface UIActions {
  start: (levelId: number) => void;
  resume: () => void;
  restart: () => void;
  mainMenu: () => void;
  nextLevel: () => void;
  toggleAudio: () => void;
  skipIntro: () => void;
}

/** DOM presentation only. Game owns mission, screen state, audio, and timing. */
export class UI {
  readonly target: HTMLDivElement;
  private readonly elements = new Map<string, HTMLElement>();
  private screen: GameState = 'MAIN_MENU';
  private selectedLevel = 1;
  private levels: readonly LevelConfig[] = [];
  private currentStatus = '';
  private currentNotice = '';
  private currentResult = '';

  constructor(private container: HTMLElement, private actions: UIActions, levels: readonly LevelConfig[] = LEVELS) {
    container.insertAdjacentHTML('beforeend', `
      <div class="scene-shade" aria-hidden="true"></div>
      <div id="game-hud" class="game-hud hidden">
        <header class="top">
          <div class="mission-objective"><small>OBJECTIVE</small><p id="objective">Rescue remaining survivors</p><div class="survivor-summary"><strong id="remaining-count">6</strong><span>REMAINING</span><i></i><span id="safe-count">0 / 6 SAFE</span></div><div id="camp-support" class="camp-support hidden">CAMP SUPPORT <strong id="donated-count">0</strong> COINS</div></div>
          <div class="telemetry"><div id="vehicle-label" class="vehicle-label hidden">HELICOPTER</div><div class="speed-readout"><span id="speed">0</span><small>KM/H</small></div><div id="flight-altitude" class="flight-altitude hidden"><strong id="altitude">0</strong><span>M ALTITUDE</span></div><div id="passenger-readout" class="passenger-count"><div id="seat-dots" aria-hidden="true"><i></i><i></i><i></i></div><strong id="rescued-count">0 / 3</strong><small>PASSENGERS</small></div><div id="boat-integrity" class="integrity"><span>BOAT</span><div class="integrity-track"><i id="integrity-bar"></i></div><span id="integrity-value">100%</span></div><div id="supply-count" class="supply-count hidden" aria-label="Collected supplies"><span class="kit-count"><i aria-hidden="true">+</i><strong id="kit-count">0</strong><small>KITS</small></span><span class="coin-count"><i aria-hidden="true">♥</i><strong id="coin-count">0</strong><small>COINS</small></span></div></div>
        </header>
        <div id="world-target" class="world-target"><div class="target-glyph">!</div><div class="target-label"><span id="target-name">SURVIVORS</span><span id="target-distance"></span></div></div>
        <div id="aid-notice" class="aid-notice hidden" role="status" aria-live="polite"></div>
        <div id="flight-controls" class="flight-controls hidden"></div>
        <div id="context" class="context hidden"><kbd id="interaction-key" class="hidden">E</kbd><span id="context-message"></span></div>
      </div>
      <section id="main-menu" class="menu-screen" aria-label="Main menu">
        <div id="menu-home" class="menu-home"><div class="menu-kicker"><span class="status-dot"></span> A RESCUE MISSION</div><h1>KERALA<span>FLOOD RESCUE</span></h1><div class="menu-date">AUGUST 2018</div><p class="menu-quote">The roads are gone.<br>The water is still rising.<br>People are waiting.</p><div class="home-actions"><button id="start-button" class="button primary">START RESCUE <span aria-hidden="true">↗</span></button><button id="level-select-button" class="button quiet">LEVEL SELECT <span aria-hidden="true">01 — 03</span></button><button id="how-to-button" class="button quiet">HOW TO PLAY <span aria-hidden="true">+</span></button><button class="button quiet audio-button">AUDIO: ON <span aria-hidden="true">♪</span></button></div></div>
        <div id="menu-levels" class="menu-panel hidden"><div class="panel-heading"><div><small>CHOOSE YOUR MISSION</small><h2>LEVEL SELECT</h2></div><button class="back-button" data-back aria-label="Back to main menu">← BACK</button></div><div id="level-options" class="level-options" role="group" aria-label="Rescue levels"></div><div class="level-footer"><p id="selected-level-description"></p><button id="level-start-button" class="button primary">START RESCUE <span aria-hidden="true">↗</span></button></div></div>
        <div id="menu-help" class="menu-panel help-panel hidden"><div class="panel-heading"><div><small>TAKE THE HELM</small><h2>HOW TO PLAY</h2></div><button class="back-button" data-back aria-label="Back to main menu">← BACK</button></div><div class="help-columns"><dl class="control-list"><div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>Accelerate</dd></div><div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>Reverse</dd></div><div><dt><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd></dt><dd>Steer</dd></div><div><dt><kbd>SPACE</kbd></dt><dd>Brake</dd></div><div><dt><kbd>E</kbd></dt><dd>Rescue / interact</dd></div><div><dt><kbd>C</kbd></dt><dd>Camera</dd></div><div><dt><kbd>R</kbd></dt><dd>Restart level</dd></div><div><dt><kbd>ESC</kbd></dt><dd>Pause</dd></div></dl><div class="rescue-guide"><small>BRING EVERYONE HOME</small><ol><li><strong>Find the amber markers.</strong><span>Approach survivors slowly and stop near their rescue point.</span></li><li><strong>Collect aid along the way.</strong><span>Drive over floating kits and heart-shaped coins. Injured survivors need one kit: press E to treat, then E again to rescue.</span></li><li><strong>Make room for three.</strong><span>Your boat carries a driver and up to three survivors per trip.</span></li><li><strong>Return to the relief camp.</strong><span>Stop by the mint marker and press E to unload passengers and donate collected coins to camp.</span></li><li><strong>Head out again.</strong><span>Bring everyone to safety. Watch for drifting debris and submerged obstacles.</span></li></ol></div></div><section class="flight-guide" aria-labelledby="flight-guide-title"><div><small>OPTIONAL AIR RECONNAISSANCE</small><h3 id="flight-guide-title">THE ROOFTOP HELIPAD</h3><p>Stop an empty boat beside the brutalist tower and press <kbd>E</kbd> to board the helicopter on its roof. Use the boat to rescue people.</p><p>To switch back, descend gently onto the helipad centre, stop, and press <kbd>E</kbd>. Your boat stays at the dock.</p></div><dl class="control-list flight-control-list"><div><dt><kbd>W</kbd> / <kbd>S</kbd></dt><dd>Fly forward / back</dd></div><div><dt><kbd>A</kbd> / <kbd>D</kbd></dt><dd>Turn</dd></div><div><dt><kbd>SPACE</kbd> / <kbd>SHIFT</kbd></dt><dd>Climb / descend</dd></div><div><dt><kbd>Q</kbd></dt><dd>Hover / brake</dd></div></dl></section></div>
      </section>
      <section id="level-intro" class="overlay intro-screen hidden" role="dialog" aria-modal="true" aria-labelledby="intro-title"><div class="intro-card"><small>KERALA — AUGUST 2018</small><div id="intro-number" class="intro-number">LEVEL 01</div><h2 id="intro-title">THE FIRST CALL</h2><p id="intro-briefing"></p><div class="intro-task"><span id="intro-survivors">CAPACITY 3 · 3 PEOPLE</span></div><div class="intro-rule"></div><button id="skip-intro-button" class="back-button"><kbd>SPACE</kbd> TO SKIP</button></div></section>
      <section id="pause-menu" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="pause-heading"><div class="pause-card"><small>TAKE A BREATH</small><h2 id="pause-heading">PAUSED</h2><div class="stack-actions"><button id="resume-button" class="button primary">RESUME <span aria-hidden="true">↗</span></button><button id="pause-restart-button" class="button secondary">RESTART LEVEL</button><button class="button secondary audio-button">AUDIO: ON</button><button id="pause-main-button" class="button secondary">MAIN MENU</button></div></div></section>
      <section id="complete" class="overlay completion hidden" role="dialog" aria-modal="true" aria-labelledby="complete-heading"><div class="complete-card"><small id="complete-kicker">ALL SURVIVORS SAFE</small><h2 id="complete-heading">MISSION<br>COMPLETE</h2><div id="result-rating" class="result-rating" aria-label="Three stars">★ ★ ★</div><div class="result-statistics"><div><span>PEOPLE RESCUED</span><strong id="result-people">6 / 6</strong></div><div id="result-treated-row" class="hidden"><span>PEOPLE TREATED</span><strong id="result-treated">0</strong></div><div id="result-donated-row" class="hidden"><span>CAMP FUNDING</span><strong id="result-donated">0 COINS</strong></div><div><span>TRIPS</span><strong id="result-trips">2</strong></div><div><span>MISSION TIME</span><strong id="result-time">04:32</strong></div><div><span>BOAT INTEGRITY</span><strong id="result-integrity">86%</strong></div></div><div class="stack-actions"><button id="next-level-button" class="button primary">NEXT LEVEL <span aria-hidden="true">↗</span></button><button id="restart-button" class="button secondary">RETRY</button><button id="complete-main-button" class="button text-button">MAIN MENU</button></div></div></section>
      <div id="loading" class="loading"><div><small>KERALA · FLOOD RESPONSE</small><h2>EVERY RESCUE<br>MATTERS.</h2><div class="loading-track"><div id="loading-progress"></div></div><p id="loading-phase">Preparing your boat…</p></div></div>
      <span id="status-announcer" class="sr-only" role="status" aria-live="polite"></span>
      <div id="pause-notice" class="pause-notice hidden" role="status"><strong id="pause-title">PAUSED</strong><span id="pause-detail"></span></div>
    `);
    container.querySelectorAll<HTMLElement>('[id]').forEach(element => this.elements.set(element.id, element));
    this.target = this.get('world-target') as HTMLDivElement;
    this.on('start-button', () => this.actions.start(this.selectedLevel));
    this.on('level-start-button', () => this.actions.start(this.selectedLevel));
    this.on('level-select-button', () => this.showMenuPanel('levels'));
    this.on('how-to-button', () => this.showMenuPanel('help'));
    this.on('skip-intro-button', () => this.actions.skipIntro());
    this.on('resume-button', () => this.actions.resume());
    this.on('pause-restart-button', () => this.actions.restart());
    this.on('restart-button', () => this.actions.restart());
    this.on('pause-main-button', () => this.actions.mainMenu());
    this.on('complete-main-button', () => this.actions.mainMenu());
    this.on('next-level-button', () => this.actions.nextLevel());
    container.querySelectorAll<HTMLButtonElement>('[data-back]').forEach(button => button.addEventListener('click', () => this.showMenuPanel('home')));
    container.querySelectorAll<HTMLButtonElement>('.audio-button').forEach(button => button.addEventListener('click', () => this.actions.toggleAudio()));
    container.addEventListener('keydown', event => this.trapFocus(event));
    this.setLevels(levels);
    this.get('main-menu').inert = true;
  }

  private get(id: string) { return this.elements.get(id)!; }
  private on(id: string, callback: () => void) { this.get(id).addEventListener('click', callback); }
  private showMenuPanel(panel: 'home' | 'levels' | 'help') {
    for (const name of ['home', 'levels', 'help']) this.get(`menu-${name}`).classList.toggle('hidden', name !== panel);
    this.get(panel === 'home' ? 'start-button' : panel === 'levels' ? 'level-options' : 'menu-help').querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    if (panel === 'home') this.get('start-button').focus();
  }

  setLevels(levels: readonly LevelConfig[]) {
    this.levels = levels;
    const options = this.get('level-options');
    options.replaceChildren();
    for (const level of levels) {
      const button = document.createElement('button');
      button.className = 'level-card';
      button.disabled = !level.unlocked;
      button.dataset.level = String(level.id);
      button.setAttribute('aria-pressed', 'false');
      const number = document.createElement('span'); number.className = 'level-number'; number.textContent = String(level.id).padStart(2, '0');
      const title = document.createElement('strong'); title.textContent = level.title;
      const information = document.createElement('span'); information.className = 'level-information'; information.textContent = `${level.survivors} SURVIVORS · ${level.difficulty.toUpperCase()}`;
      const status = document.createElement('span'); status.className = 'level-status'; status.textContent = !level.unlocked ? 'LOCKED' : 'SELECT MISSION';
      button.append(number, title, information, status);
      button.addEventListener('click', () => this.selectLevel(level.id));
      options.append(button);
    }
    this.selectLevel(this.selectedLevel);
  }

  selectLevel(id: number) {
    const level = this.levels.find(item => item.id === id && item.unlocked) ?? this.levels.find(item => item.unlocked);
    if (!level) return;
    this.selectedLevel = level.id;
    this.container.querySelectorAll<HTMLButtonElement>('.level-card').forEach(button => {
      const selected = Number(button.dataset.level) === level.id;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (!button.disabled) button.querySelector('.level-status')!.textContent = selected ? 'SELECTED' : 'SELECT MISSION';
    });
    this.get('selected-level-description').textContent = level.id === 1 ? 'One family. One boat. Your first call.' : `Up to three passengers aboard. At least ${Math.ceil(level.survivors / 3)} trips to bring everyone home.`;
  }

  setScreen(screen: GameState, level?: LevelConfig, statistics?: HUDState) {
    if (level && this.selectedLevel !== level.id) this.selectLevel(level.id);
    const changed = screen !== this.screen;
    this.screen = screen;
    const playing = ['PLAYING', 'RESCUING', 'UNLOADING', 'SWITCHING'].includes(screen);
    this.get('game-hud').classList.toggle('hidden', !playing);
    this.get('main-menu').classList.toggle('hidden', screen !== 'MAIN_MENU');
    this.get('level-intro').classList.toggle('hidden', screen !== 'LEVEL_INTRO');
    this.get('pause-menu').classList.toggle('hidden', screen !== 'PAUSED');
    const result = screen === 'LEVEL_COMPLETE' || screen === 'LEVEL_FAILED';
    this.get('complete').classList.toggle('hidden', !result);
    this.container.dataset.gameScreen = screen;
    if (screen === 'LEVEL_INTRO' && level) {
      this.get('intro-number').textContent = `LEVEL ${String(level.id).padStart(2, '0')}`;
      this.get('intro-title').textContent = level.title;
      this.get('intro-briefing').textContent = level.briefing.join('\n');
      this.get('intro-survivors').textContent = `CAPACITY 3 · ${level.survivors} PEOPLE`;
    }
    if (result && statistics) this.showResult(statistics, screen === 'LEVEL_FAILED');
    if (!changed) return;
    if (screen === 'MAIN_MENU') this.showMenuPanel('home');
    if (screen === 'PAUSED') this.get('resume-button').focus();
    if (screen === 'LEVEL_INTRO') this.get('skip-intro-button').focus();
    if (result) this.get(screen === 'LEVEL_COMPLETE' && !this.get('next-level-button').classList.contains('hidden') ? 'next-level-button' : 'restart-button').focus();
  }

  setAudio(enabled: boolean) {
    this.container.querySelectorAll<HTMLButtonElement>('.audio-button').forEach(button => {
      button.textContent = `AUDIO: ${enabled ? 'ON' : 'OFF'}`;
      button.setAttribute('aria-pressed', String(enabled));
    });
  }

  setLoading(message: string, fraction: number) {
    this.get('loading-phase').textContent = message;
    this.get('loading-progress').style.width = `${Math.round(Math.max(0.03, Math.min(1, fraction)) * 100)}%`;
  }
  loaded() { this.get('loading').classList.add('hidden'); this.get('main-menu').inert = false; this.get('start-button').focus(); }
  fail(message: string) { this.get('loading').classList.remove('hidden'); this.get('loading-phase').textContent = message; }
  setPaused(reason: 'focus' | 'graphics' | null) {
    this.get('pause-notice').classList.toggle('hidden', reason === null);
    this.get('pause-title').textContent = reason === 'graphics' ? 'RESTORING THE VIEW…' : 'PAUSED';
    this.get('pause-detail').textContent = reason === 'graphics' ? 'Your mission is paused while the view recovers.' : 'Return to the game to continue.';
  }

  update(speed: number, _overview: boolean, state: HUDState) {
    const flying = state.vehicle === 'helicopter';
    this.get('game-hud').classList.toggle('flying', flying);
    this.get('vehicle-label').classList.toggle('hidden', !flying);
    this.get('flight-altitude').classList.toggle('hidden', !flying);
    this.get('altitude').textContent = String(Math.max(0, Math.round(state.altitude ?? 0)));
    this.get('passenger-readout').classList.toggle('hidden', flying);
    this.get('boat-integrity').classList.toggle('hidden', flying);
    this.get('flight-controls').classList.toggle('hidden', !flying);
    this.get('flight-controls').textContent = state.vehicleHint ?? 'W/S fly · A/D turn · Space ↑ · Shift ↓ · Q hover';
    this.get('speed').textContent = Math.round(speed * 3.6).toString();
    this.get('objective').textContent = state.objective;
    this.get('remaining-count').textContent = String(state.remaining);
    this.get('safe-count').textContent = `${state.safe} / ${state.total} SAFE`;
    this.get('rescued-count').textContent = `${state.passengers} / 3`;
    this.get('seat-dots').querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('occupied', i < state.passengers));
    this.get('rescued-count').classList.toggle('full', state.passengers === 3);
    const integrity = Math.max(0, Math.round(state.integrity));
    this.get('integrity-value').textContent = `${integrity}%`;
    this.get('integrity-bar').style.width = `${integrity}%`;
    this.get('integrity-bar').classList.toggle('damaged', integrity < 35);
    const hasSupplies = state.kits !== undefined || state.coins !== undefined;
    this.get('supply-count').classList.toggle('hidden', !hasSupplies);
    this.get('kit-count').textContent = String(state.kits ?? 0);
    this.get('coin-count').textContent = String(state.coins ?? 0);
    this.get('kit-count').classList.toggle('needed', (state.injured ?? 0) > 0 && (state.kits ?? 0) === 0);
    this.get('camp-support').classList.toggle('hidden', (state.donated ?? 0) === 0);
    this.get('donated-count').textContent = String(state.donated ?? 0);
    const notice = state.notice ?? '';
    if (notice !== this.currentNotice) {
      this.get('aid-notice').textContent = notice;
      this.currentNotice = notice;
    }
    this.get('aid-notice').classList.toggle('hidden', !state.notice || state.completed || state.failed);
    this.get('context-message').textContent = state.message.replace(/^\[\s*E\s*\]\s*/i, '').replace(/^E\b\s*(?:—\s*)?/i, '').replace(/^PRESS E TO\s*/i, '');
    this.get('interaction-key').classList.toggle('hidden', !state.ready);
    this.get('context').classList.toggle('ready', state.ready);
    this.get('context').classList.toggle('hidden', state.completed || state.failed || !state.message);
    const targetKind = state.targetKind ?? (state.targetIsCamp ? 'camp' : 'survivor');
    this.target.classList.toggle('camp-target', targetKind === 'camp');
    this.target.classList.toggle('kit-target', targetKind === 'kit');
    this.target.classList.toggle('helipad-target', targetKind === 'helipad');
    this.get('target-name').textContent = state.targetLabel ?? (targetKind === 'camp' ? 'RELIEF CAMP' : targetKind === 'kit' ? 'MEDICAL KIT' : targetKind === 'helipad' ? 'HELIPAD' : 'SURVIVORS');
    this.get('target-distance').textContent = state.distance <= 40 ? `${Math.round(state.distance)} m` : '';
    this.target.querySelector('.target-glyph')!.textContent = targetKind === 'survivor' ? '!' : targetKind === 'helipad' ? 'H' : '+';
    if (state.message !== this.currentStatus) {
      this.get('status-announcer').textContent = state.message;
      this.currentStatus = state.message;
    }
  }

  private showResult(state: HUDState, failed: boolean) {
    const result = `${this.selectedLevel}:${state.total}:${state.safe}:${state.trips}:${Math.floor(state.time)}:${Math.round(state.integrity)}:${state.treated}:${state.donated}:${failed}`;
    if (this.currentResult === result) return;
    this.currentResult = result;
    this.get('complete').classList.toggle('failed', failed);
    this.get('complete-kicker').textContent = failed ? 'BOAT DAMAGED' : 'ALL SURVIVORS SAFE';
    this.get('complete-heading').innerHTML = failed ? 'MISSION<br>FAILED' : 'MISSION<br>COMPLETE';
    this.get('result-people').textContent = `${state.safe} / ${state.total}`;
    this.get('result-treated-row').classList.toggle('hidden', state.treated === undefined);
    this.get('result-treated').textContent = String(state.treated ?? 0);
    this.get('result-donated-row').classList.toggle('hidden', state.donated === undefined);
    this.get('result-donated').textContent = `${state.donated ?? 0} COINS`;
    this.get('result-trips').textContent = String(state.trips);
    const seconds = Math.floor(state.time);
    this.get('result-time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    this.get('result-integrity').textContent = `${Math.max(0, Math.round(state.integrity))}%`;
    const stars = failed ? 0 : missionRating(state.time, state.integrity, this.levels.find(level => level.id === this.selectedLevel)?.parTime ?? state.total * 100);
    this.get('result-rating').textContent = Array.from({ length: 3 }, (_, i) => i < stars ? '★' : '☆').join(' ');
    this.get('result-rating').setAttribute('aria-label', `${stars} out of three stars`);
    this.get('result-rating').classList.toggle('hidden', failed);
    const hasNext = this.levels.some(level => level.id > this.selectedLevel && level.unlocked);
    this.get('next-level-button').classList.toggle('hidden', failed || !hasNext);
    this.get('restart-button').textContent = failed ? 'RESTART' : 'RETRY';
    this.get('restart-button').classList.toggle('primary', failed || !hasNext);
    this.get('restart-button').classList.toggle('secondary', !failed && hasNext);
  }

  private trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || ['PLAYING', 'RESCUING', 'UNLOADING'].includes(this.screen)) return;
    const visible = [...this.container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button => button.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0], last = visible[visible.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
