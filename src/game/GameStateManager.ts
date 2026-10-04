export type GameState = 'MAIN_MENU' | 'LEVEL_INTRO' | 'PLAYING' | 'RESCUING' | 'UNLOADING' | 'PAUSED' | 'LEVEL_COMPLETE' | 'LEVEL_FAILED';

const transitions: Record<GameState, readonly GameState[]> = {
  MAIN_MENU: ['LEVEL_INTRO'],
  LEVEL_INTRO: ['PLAYING', 'MAIN_MENU', 'LEVEL_INTRO'],
  PLAYING: ['RESCUING', 'UNLOADING', 'PAUSED', 'LEVEL_COMPLETE', 'LEVEL_FAILED', 'MAIN_MENU', 'LEVEL_INTRO'],
  RESCUING: ['PLAYING', 'PAUSED', 'LEVEL_FAILED', 'MAIN_MENU', 'LEVEL_INTRO'],
  UNLOADING: ['PLAYING', 'PAUSED', 'LEVEL_COMPLETE', 'LEVEL_FAILED', 'MAIN_MENU', 'LEVEL_INTRO'],
  PAUSED: ['PLAYING', 'RESCUING', 'UNLOADING', 'MAIN_MENU', 'LEVEL_INTRO'],
  LEVEL_COMPLETE: ['MAIN_MENU', 'LEVEL_INTRO'],
  LEVEL_FAILED: ['MAIN_MENU', 'LEVEL_INTRO'],
};

export class GameStateManager {
  state: GameState = 'MAIN_MENU';
  private beforePause: GameState = 'PLAYING';
  get simulating() { return ['PLAYING', 'RESCUING', 'UNLOADING'].includes(this.state); }
  transition(next: GameState) {
    if (next === this.state) return;
    if (!transitions[this.state].includes(next)) throw new Error(`Invalid game state: ${this.state} → ${next}`);
    this.state = next;
  }
  pause() {
    if (!this.simulating) return;
    this.beforePause = this.state;
    this.transition('PAUSED');
  }
  resume() {
    if (this.state === 'PAUSED') this.transition(this.beforePause);
  }
}
