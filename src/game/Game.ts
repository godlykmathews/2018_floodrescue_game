import { ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer, PCFSoftShadowMap, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import { Boat } from './Boat';
import { CameraController } from './CameraController';
import { Water, sampleFloodHeight } from './Water';
import { World } from './World';
import { Rain } from './Rain';
import { SurvivorManager } from './SurvivorManager';
import { RescueMission } from './RescueMission';
import { UI } from './UI';
import { ReliefCamp } from './ReliefCamp';
import { Wake } from './Wake';
import { GameStateManager, type GameState } from './GameStateManager';
import { LevelManager } from './LevelManager';
import { AudioManager } from './AudioManager';
import { IntroVideo } from './IntroVideo';

export class Game {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 360);
  readonly renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  readonly boat = new Boat();
  readonly cameraController = new CameraController(this.camera);
  readonly water = new Water();
  readonly wake = new Wake();
  readonly loader = new AssetLoader();
  readonly world = new World();
  readonly rain = new Rain();
  readonly survivors = new SurvivorManager();
  get survivor() { return this.survivors.active[0]; }
  readonly camp = new ReliefCamp();
  readonly states = new GameStateManager();
  readonly levels = new LevelManager();
  readonly audio = new AudioManager();
  mission = new RescueMission(this.boat, this.survivors.active);
  readonly ui: UI;
  readonly introVideo: IntroVideo;
  private projected = new Vector3();
  private current = new Vector3();
  private sun = new DirectionalLight(0xd8e2da, 1.8);
  private keys = new Set<string>();
  private lastTime = 0;
  private elapsed = 0;
  private introTime = 0;
  private ready = false;
  private contextLost = false;
  private focusPaused = false;
  private lastThunder = 0;
  private siteMarkers: HTMLDivElement[] = [];
  get paused() { return this.contextLost || this.focusPaused || document.hidden || this.states.state === 'PAUSED'; }
  constructor(private container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.append(this.renderer.domElement);
    this.ui = new UI(container, {
      start: id => this.startLevel(id, true), resume: () => this.resume(), restart: () => this.restart(),
      mainMenu: () => this.mainMenu(), nextLevel: () => this.startLevel(this.levels.next?.id ?? 1),
      toggleAudio: () => this.toggleAudio(),
      skipIntro: () => this.skipIntro(),
    });
    this.introVideo = new IntroVideo(container, () => this.finishStoryVideo(), () => this.toggleAudio());
    this.ui.setAudio(this.audio.enabled);
    this.siteMarkers = this.survivors.sites.map(() => {
      const marker = document.createElement('div');
      marker.className = 'world-target secondary-target';
      marker.innerHTML = '<div class="target-glyph">!</div><div class="target-label">SURVIVORS</div>';
      marker.hidden = true; container.append(marker); return marker;
    });
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D flood rescue game. Use WASD to steer, Space to brake, E to rescue.');
    this.scene.background = new Color(0x819494);
    this.scene.fog = new FogExp2(0x819494, this.levels.current.fogDensity);
    this.scene.add(new HemisphereLight(0xcadce0, 0x5c6956, 2.4));
    const sun = this.sun;
    sun.position.set(-25, 38, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 110 });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.scene.add(this.water.mesh, this.wake.root, this.boat.root, this.world.root, this.rain.mesh, this.survivors.root, this.camp.root);
    this.world.colliders.push(...this.survivors.colliders, this.camp.collider);
    this.boat.controller.onCollision = speed => {
      if (!this.states.simulating) return;
      this.mission.damage(Math.min(14, Math.max(4, (speed - 2.5) * 2)));
      this.cameraController.shake(0.035 + speed * 0.009);
    };
    this.cameraController.update(0, this.boat.controller, true);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    addEventListener('keydown', event => {
      if (!this.ready || this.contextLost || this.focusPaused || document.hidden) return;
      if (this.states.state === 'STORY_VIDEO' && ['Space', 'Escape'].includes(event.code)) {
        // Space must still activate the focused media control through its native click.
        if (event.code === 'Space' && event.target instanceof HTMLElement && event.target.closest('button')) return;
        event.preventDefault();
        if (!event.repeat) this.introVideo.finish();
        return;
      }
      if (event.code === 'Escape' && !event.repeat) {
        event.preventDefault();
        if (this.states.state === 'PAUSED') this.resume();
        else if (this.states.simulating) { this.states.pause(); this.showState(); this.keys.clear(); }
        return;
      }
      if (this.states.state === 'LEVEL_INTRO' && event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.skipIntro();
        return;
      }
      if (!event.repeat && event.code === 'KeyR' && this.states.state !== 'MAIN_MENU') { this.restart(); return; }
      const isControl = event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, [contenteditable]');
      if (isControl) return;
      if (!this.states.simulating) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && event.code === 'KeyC') this.cameraController.toggle();
      if (!event.repeat && event.code === 'KeyE') { this.mission.interact(); this.syncMissionState(); }
    });
    addEventListener('keyup', event => this.keys.delete(event.code));
    addEventListener('blur', () => { this.focusPaused = true; this.refreshPause(); });
    addEventListener('focus', () => { this.focusPaused = false; this.refreshPause(); });
    document.addEventListener('visibilitychange', () => this.refreshPause());
    this.renderer.domElement.addEventListener('pointerdown', () => { this.focusPaused = false; this.refreshPause(); });
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.contextLost = true; this.refreshPause(); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.contextLost = false; this.refreshPause(); });
  }
  async start() {
    let loaded = 0;
    const totalModels = 73;
    this.loader.onProgress = (name, fraction) => {
      this.ui.setLoading(`Loading ${name.replace(/_/g, ' ')} · ${Math.round(fraction * 100)}%`, Math.min(1, (loaded + fraction) / totalModels));
    };
    this.loader.onComplete = () => { loaded++; };
    await this.boat.load(this.loader);
    await this.world.load(this.loader);
    await this.survivors.load(this.loader);
    await this.camp.load(this.loader);
    this.ready = true;
    this.ui.loaded();
    this.showState();
    this.refreshPause();
    this.renderer.setAnimationLoop(this.frame);
  }
  private showState() {
    this.audio.setPlaying(this.states.simulating && !this.paused);
    this.ui.setScreen(this.states.state, this.levels.current, this.mission.getHUD());
    if (!this.states.simulating) this.siteMarkers.forEach(marker => { marker.hidden = true; });
  }
  private refreshPause() {
    this.keys.clear(); this.lastTime = 0;
    const interrupted = this.focusPaused || document.hidden;
    this.introVideo.setSuspended(this.paused);
    this.audio.setPlaying(this.states.simulating && !this.paused);
    this.ui.setPaused(this.contextLost ? 'graphics' : interrupted && this.states.simulating ? 'focus' : null);
  }
  startLevel(id: number, playFilm = false) {
    if (!this.ready) return;
    const level = this.levels.select(id);
    this.introVideo.stop();
    void this.audio.unlock();
    this.mission.reset();
    this.survivors.configure(level.counts);
    this.mission = new RescueMission(this.boat, this.survivors.active);
    this.mission.onRescue = () => this.audio.play('rescue');
    this.lastThunder = 0;
    this.world.setDifficulty(level);
    this.rain.setIntensity(level.rainMultiplier);
    (this.scene.fog as FogExp2).density = level.fogDensity;
    this.keys.clear(); this.wake.reset(); this.introTime = 0;
    this.updateBoatVisual();
    this.cameraController.overview = false;
    this.states.transition(playFilm ? 'STORY_VIDEO' : 'LEVEL_INTRO');
    this.showState();
    if (playFilm) this.introVideo.start(this.audio.enabled);
    else this.renderer.domElement.focus();
  }
  private toggleAudio() {
    const enabled = this.audio.toggle();
    this.ui.setAudio(enabled); this.introVideo.setAudio(enabled);
  }
  private finishStoryVideo() {
    if (this.states.state !== 'STORY_VIDEO') return;
    this.states.transition('LEVEL_INTRO');
    this.introTime = 0; this.lastTime = 0; this.keys.clear();
    this.showState(); this.renderer.domElement.focus();
  }
  skipIntro() {
    if (this.states.state !== 'LEVEL_INTRO') return;
    this.states.transition('PLAYING'); this.keys.clear(); this.lastTime = 0;
    this.cameraController.update(0, this.boat.controller, true);
    this.showState(); this.renderer.domElement.focus();
  }
  restart() { this.startLevel(this.levels.current.id); }
  resume() { this.states.resume(); this.keys.clear(); this.lastTime = 0; this.showState(); this.renderer.domElement.focus(); }
  mainMenu() {
    this.introVideo.stop();
    this.states.transition('MAIN_MENU'); this.keys.clear(); this.mission.reset(); this.wake.reset();
    this.showState();
  }
  private syncMissionState() {
    const phase = this.mission.phase;
    const next: GameState = phase === 'boarding' ? 'RESCUING' : phase === 'unloading' ? 'UNLOADING'
      : phase === 'complete' ? 'LEVEL_COMPLETE' : phase === 'failed' ? 'LEVEL_FAILED' : 'PLAYING';
    if (this.states.state !== next) {
      this.states.transition(next); this.showState();
      if (next === 'LEVEL_COMPLETE') this.audio.play('complete');
    }
  }
  private updateMarker() {
    const gameplay = this.states.simulating;
    this.camera.updateMatrixWorld();
    this.siteMarkers.forEach((marker, index) => {
      const site = this.survivors.sites[index];
      const waiting = site.people.filter(person => person.root.visible && person.state === 'WAITING');
      const distance = this.boat.controller.position.distanceTo(site.position);
      const isTarget = waiting.some(person => person.position === this.mission.target);
      this.projected.copy(site.position).add(new Vector3(0, 2.7, 0)).project(this.camera);
      marker.hidden = !gameplay || !waiting.length || isTarget || this.projected.z > 1 || Math.abs(this.projected.x) > .9 || Math.abs(this.projected.y) > .85;
      marker.style.left = `${(this.projected.x * .5 + .5) * innerWidth}px`;
      marker.style.top = `${(-this.projected.y * .5 + .5) * innerHeight}px`;
      marker.querySelector('.target-label')!.textContent = `SURVIVORS${distance < 32 ? ` · ${Math.round(distance)} m` : ''}`;
    });
    this.ui.update(this.boat.controller.speed, this.cameraController.overview, this.mission.getHUD());
    this.camera.updateMatrixWorld();
    this.projected.copy(this.mission.target);
    this.projected.y = this.mission.target === this.mission.campPosition ? 4 : this.mission.target.y + 2.7;
    this.projected.project(this.camera);
    const behind = this.projected.z > 1;
    if (behind) this.projected.x *= -1;
    const x = Math.max(85, Math.min(innerWidth - 85, (this.projected.x * .5 + .5) * innerWidth));
    const y = behind ? innerHeight * .47 : Math.max(150, Math.min(innerHeight - 150, (-this.projected.y * .5 + .5) * innerHeight));
    this.ui.target.style.left = `${x}px`; this.ui.target.style.top = `${y}px`;
    this.ui.target.style.display = !gameplay || ['boarding', 'unloading'].includes(this.mission.phase) ? 'none' : '';
    this.ui.target.classList.toggle('offscreen', behind || Math.abs(this.projected.x) > .95);
    this.ui.target.dataset.direction = x < innerWidth / 2 ? 'left' : 'right';
  }
  private frame = (now: number) => {
    if (!this.ready || this.paused || this.states.state === 'STORY_VIDEO') { this.lastTime = 0; return; }
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 1 / 60;
    this.lastTime = now;
    if (this.states.state === 'LEVEL_COMPLETE' || this.states.state === 'LEVEL_FAILED') return;
    this.elapsed += dt;
    if (this.states.simulating) {
      const pressed = (...codes: string[]) => codes.some(code => this.keys.has(code));
      const input = { throttle: Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown')),
        steer: Number(pressed('KeyD', 'ArrowRight')) - Number(pressed('KeyA', 'ArrowLeft')), brake: pressed('Space') };
      const steps = Math.ceil(dt / (1 / 90));
      this.world.getCurrent(this.boat.controller.position, this.current);
      for (let i = 0; i < steps; i++) this.boat.controller.update(dt / steps, input, this.world.colliders, this.current);
      this.updateBoatVisual(); this.mission.update(dt);
      this.syncMissionState();
      this.audio.update(this.boat.controller.speed);
      this.wake.update(dt, this.elapsed, this.boat.controller);
      this.cameraController.update(dt, this.boat.controller);
    } else {
      const angle = this.elapsed * .018;
      this.camera.position.set(4 + Math.sin(angle) * 34, 18, -5 + Math.cos(angle) * 34);
      this.camera.lookAt(4, 0, -7);
      this.updateBoatVisual();
      if (this.states.state === 'LEVEL_INTRO') { this.introTime += dt; if (this.introTime >= 4.5) this.skipIntro(); }
    }
    this.camp.update(this.elapsed, this.mission.passengers.count > 0);
    this.water.update(this.elapsed); this.world.update(this.elapsed, dt); this.survivors.update(this.elapsed);
    const thunder = Math.floor(this.mission.missionTime / 28);
    if (this.levels.current.id === 3 && this.states.simulating && thunder > this.lastThunder) {
      this.lastThunder = thunder; this.audio.play('thunder');
    }
    const stormPhase = this.mission.missionTime % 28;
    this.sun.intensity = 1.8 + (this.levels.current.id === 3 && this.states.simulating && this.mission.missionTime > 28 && stormPhase < 0.3
      ? Math.sin(stormPhase / 0.3 * Math.PI) * 1.8 : 0);
    this.rain.update(dt, this.boat.controller.position);
    this.camp.updateView(this.camera.position, this.boat.controller.position, dt);
    this.updateMarker(); this.renderer.render(this.scene, this.camera);
  };
  private updateBoatVisual() {
    const position = this.boat.controller.position;
    this.boat.update(this.elapsed, sampleFloodHeight(position.x, position.z, this.elapsed));
  }
}
