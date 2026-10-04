/** Short original tribute lines, paced against the film's own playback clock. */
const INTRO_CAPTIONS = [
  'When the waters rose, Kerala stood together.',
  'Roads disappeared beneath the rising water.',
  'Fishermen answered the call.',
  'Every helping hand made a difference.',
  'Take the helm. Bring them home.',
] as const;
const CAPTION_SECONDS = 9;

/** Gesture-started story film. Mission state and timing stay in Game. */
export class IntroVideo {
  private readonly overlay: HTMLElement;
  private readonly video: HTMLVideoElement;
  private readonly playback: HTMLButtonElement;
  private readonly sound: HTMLButtonElement;
  private readonly notice: HTMLElement;
  private readonly caption: HTMLElement;
  private active = false;
  private generation = 0;
  private suspended = false;
  private resumeAfterSuspension = false;

  constructor(container: HTMLElement, private onFinished: () => void, onToggleAudio: () => void) {
    this.overlay = document.createElement('section');
    this.overlay.id = 'story-video';
    this.overlay.className = 'story-video';
    this.overlay.hidden = true;
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'film-title');
    this.overlay.innerHTML = `
      <video id="intro-film" playsinline preload="none" aria-label="Kerala flood introduction"></video>
      <div class="film-header"><div class="film-toolbar"><span id="film-title">KERALA <span>· AUGUST 2018</span></span>
        <div class="film-actions">
          <button id="film-audio" class="film-button">AUDIO: ON</button>
          <button id="film-playback" class="film-button">PAUSE</button>
          <button id="skip-video-button" class="film-button film-skip">SKIP INTRO <kbd>SPACE</kbd></button>
        </div>
      </div>
      </div>
      <div class="film-caption"><p class="film-tribute">${INTRO_CAPTIONS[0]}</p></div>
      <p id="film-notice" class="film-notice" role="status" hidden>Loading introduction…</p>`;
    container.append(this.overlay);
    this.video = this.overlay.querySelector('video')!;
    this.video.src = `${import.meta.env.BASE_URL}Intro_Video.mp4`;
    this.playback = this.overlay.querySelector('#film-playback')!;
    this.sound = this.overlay.querySelector('#film-audio')!;
    this.notice = this.overlay.querySelector('#film-notice')!;
    this.caption = this.overlay.querySelector('.film-tribute')!;
    this.video.addEventListener('timeupdate', () => this.updateCaption());
    this.video.addEventListener('seeked', () => this.updateCaption());
    this.overlay.querySelector('#skip-video-button')!.addEventListener('click', () => this.finish());
    this.sound.addEventListener('click', onToggleAudio);
    this.playback.addEventListener('click', () => {
      if (this.video.paused) void this.play();
      else this.video.pause();
    });
    this.video.addEventListener('ended', () => { if (this.video.ended) this.finish(); });
    this.video.addEventListener('error', () => this.fail());
    this.video.addEventListener('waiting', () => { if (this.active) this.notice.hidden = false; });
    this.video.addEventListener('playing', () => {
      this.notice.hidden = true; this.playback.textContent = 'PAUSE';
    });
    this.video.addEventListener('pause', () => { this.playback.textContent = 'PLAY INTRO'; });
  }

  start(audioEnabled: boolean) {
    this.stop();
    this.active = true;
    this.overlay.hidden = false;
    this.notice.textContent = 'Loading introduction…';
    this.notice.hidden = false;
    this.setAudio(audioEnabled);
    this.overlay.querySelector<HTMLButtonElement>('#skip-video-button')!.focus();
    void this.play();
  }

  private updateCaption() {
    const index = Math.min(INTRO_CAPTIONS.length - 1, Math.max(0, Math.floor(this.video.currentTime / CAPTION_SECONDS)));
    const line = INTRO_CAPTIONS[index];
    if (this.caption.textContent !== line) this.caption.textContent = line;
  }

  setAudio(enabled: boolean) {
    this.video.muted = !enabled;
    this.sound.textContent = `AUDIO: ${enabled ? 'ON' : 'OFF'}`;
    this.sound.setAttribute('aria-pressed', String(enabled));
  }

  private async play() {
    const generation = this.generation;
    try {
      await this.video.play();
    } catch (error) {
      if (!this.active || generation !== this.generation) return;
      if (this.video.error || (error instanceof DOMException && error.name === 'NotSupportedError')) {
        this.fail(); return;
      }
      // Some browsers still need a direct media gesture. Keep both Play and Skip usable.
      this.playback.textContent = 'PLAY INTRO';
      this.notice.textContent = 'Press PLAY INTRO to watch, or skip to your mission.';
      this.notice.hidden = false;
    }
  }

  /** Pause with tab/context loss, while preserving an intentional manual pause. */
  setSuspended(suspended: boolean) {
    if (!this.active || suspended === this.suspended) return;
    this.suspended = suspended;
    if (suspended) {
      this.resumeAfterSuspension = !this.video.paused;
      this.video.pause();
    } else if (this.resumeAfterSuspension) {
      this.resumeAfterSuspension = false;
      void this.play();
    }
  }

  finish() {
    if (!this.active) return;
    this.stop();
    this.onFinished();
  }

  stop() {
    this.active = false; this.generation++;
    this.suspended = false; this.resumeAfterSuspension = false;
    this.video.pause();
    this.video.currentTime = 0;
    this.updateCaption();
    this.overlay.hidden = true;
  }

  private fail() {
    if (!this.active) return;
    console.warn('[Kerala Flood Rescue] Intro video could not play; continuing to the mission.', this.video.error);
    this.finish();
  }
}
