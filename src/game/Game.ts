import { ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer, PCFSoftShadowMap, Vector3 } from 'three';
import { AssetLoader } from '../utils/AssetLoader';
import { Boat } from './Boat';
import { CameraController } from './CameraController';
import { Water } from './Water';
import { World } from './World';
import { Rain } from './Rain';
import { Survivor } from './Survivor';
import { RescueMission } from './RescueMission';
import { UI } from './UI';
import { ReliefCamp } from './ReliefCamp';
import { Wake } from './Wake';

export class Game {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 260);
  readonly renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  readonly boat = new Boat();
  readonly cameraController = new CameraController(this.camera);
  readonly water = new Water();
  readonly wake = new Wake();
  readonly loader = new AssetLoader();
  readonly world = new World();
  readonly rain = new Rain();
  readonly survivor = new Survivor();
  readonly camp = new ReliefCamp();
  readonly mission = new RescueMission(this.boat, this.survivor);
  readonly ui: UI;
  private projected = new Vector3();
  private keys = new Set<string>();
  private lastTime = 0;
  private elapsed = 0;
  private ready = false;
  private contextLost = false;
  private focusPaused = false;
  get paused() { return this.contextLost || this.focusPaused || document.hidden; }
  constructor(private container: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.append(this.renderer.domElement);
    this.ui = new UI(container, () => this.restart());
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', '3D flood rescue game. Use WASD to steer, Space to brake, E to rescue.');
    this.scene.background = new Color(0x819494);
    this.scene.fog = new FogExp2(0x819494, 0.014);
    this.scene.add(new HemisphereLight(0xcadce0, 0x5c6956, 2.4));
    const sun = new DirectionalLight(0xd8e2da, 1.8);
    sun.position.set(-25, 38, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 110 });
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.scene.add(this.water.mesh, this.wake.root, this.boat.root, this.world.root, this.rain.mesh, this.survivor.root, this.camp.root);
    this.world.colliders.push(this.survivor.collider, this.camp.collider);
    this.cameraController.update(0, this.boat.controller, true);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    addEventListener('keydown', event => {
      // Keep native keyboard activation available on the completion button.
      const isControl = event.target instanceof HTMLElement && event.target.closest('button, input, textarea, select, [contenteditable]');
      if (isControl && event.code !== 'KeyR') return;
      if (!this.ready || this.paused) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && event.code === 'KeyC') this.cameraController.toggle();
      if (!event.repeat && event.code === 'KeyR') this.restart();
      if (!event.repeat && event.code === 'KeyE') this.mission.interact();
    });
    addEventListener('keyup', event => this.keys.delete(event.code));
    addEventListener('blur', () => { this.focusPaused = true; this.refreshPause(); });
    addEventListener('focus', () => { this.focusPaused = false; this.refreshPause(); });
    document.addEventListener('visibilitychange', () => this.refreshPause());
    this.renderer.domElement.addEventListener('pointerdown', () => {
      this.focusPaused = false;
      this.refreshPause();
    });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.contextLost = true;
      this.refreshPause();
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.refreshPause();
    });
  }
  async start() {
    let loaded = 0;
    const totalModels = 27; // Boat, seven houses, twelve trees, six reeds, one survivor.
    this.loader.onProgress = (name, fraction) => {
      this.ui.setLoading(`Loading ${name.replace(/_/g, ' ')} · ${Math.round(fraction * 100)}%`, Math.min(1, (loaded + fraction) / totalModels));
    };
    this.loader.onComplete = () => { loaded++; };
    await this.boat.load(this.loader);
    await this.world.load(this.loader);
    await this.survivor.load(this.loader);
    this.ready = true;
    this.ui.loaded();
    this.refreshPause();
    this.renderer.setAnimationLoop(this.frame);
  }
  private refreshPause() {
    this.keys.clear();
    this.lastTime = 0;
    this.ui.setPaused(this.contextLost ? 'graphics' : this.paused ? 'focus' : null);
  }
  restart() {
    this.keys.clear();
    this.mission.reset();
    this.wake.reset();
    this.boat.update(this.elapsed);
    this.cameraController.update(0, this.boat.controller, true);
    this.renderer.domElement.focus();
  }
  private updateMarker() {
    const state = this.mission.getHUD();
    this.ui.update(this.boat.controller.speed, this.cameraController.overview, state);
    this.camera.updateMatrixWorld();
    this.projected.copy(this.mission.target);
    this.projected.y = this.mission.rescued ? 4 : 4.8;
    this.projected.project(this.camera);
    const behind = this.projected.z > 1;
    if (behind) this.projected.x *= -1;
    const x = Math.max(100, Math.min(innerWidth - 100, (this.projected.x * 0.5 + 0.5) * innerWidth));
    const y = behind ? innerHeight * 0.47 : Math.max(180, Math.min(innerHeight - 180, (-this.projected.y * 0.5 + 0.5) * innerHeight));
    this.ui.target.style.left = `${x}px`;
    this.ui.target.style.top = `${y}px`;
    this.ui.target.style.display = this.mission.phase === 'boarding' || this.mission.phase === 'complete' ? 'none' : '';
    this.ui.target.classList.toggle('offscreen', behind || Math.abs(this.projected.x) > 0.95);
    this.ui.target.dataset.direction = x < innerWidth / 2 ? 'left' : 'right';
  }
  private frame = (now: number) => {
    if (!this.ready || this.paused) { this.lastTime = 0; return; }
    const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = now;
    this.elapsed += dt;
    const pressed = (...codes: string[]) => codes.some(code => this.keys.has(code));
    const input = {
      throttle: Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown')),
      steer: Number(pressed('KeyD', 'ArrowRight')) - Number(pressed('KeyA', 'ArrowLeft')),
      brake: pressed('Space'),
    };
    // Fixed-size substeps make collisions stable during brief slow frames.
    const steps = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < steps; i++) this.boat.controller.update(dt / steps, input, this.world.colliders);
    this.boat.update(this.elapsed);
    this.mission.update(dt);
    this.camp.update(this.elapsed, this.mission.rescued);
    this.water.update(this.elapsed);
    this.wake.update(dt, this.elapsed, this.boat.controller);
    this.world.update(this.elapsed);
    this.rain.update(dt, this.boat.controller.position);
    this.cameraController.update(dt, this.boat.controller);
    this.updateMarker();
    this.renderer.render(this.scene, this.camera);
  };
}
