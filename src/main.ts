import './style.css';
import { Game } from './game/Game';
const app = document.querySelector<HTMLDivElement>('#app')!;
async function boot() {
  try {
    const game = new Game(app);
    await game.start();
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('touch-smoke')) {
      const { runBrowserTouch } = await import('../tests/browser-touch');
      runBrowserTouch(game);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('audio-smoke')) {
      const { runBrowserAudio } = await import('../tests/browser-audio');
      runBrowserAudio(game);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('helicopter-smoke')) {
      const { runBrowserHelicopter } = await import('../tests/browser-helicopter');
      runBrowserHelicopter(game);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('world-view')) {
      const { showWorldView } = await import('../tests/browser-world-view');
      showWorldView(game, new URLSearchParams(location.search).get('world-view')!);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('camp-view')) {
      const { showCampView } = await import('../tests/browser-camp-view');
      showCampView(game);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('recovery')) {
      const { runBrowserRecovery } = await import('../tests/browser-recovery');
      void runBrowserRecovery(game);
    }
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('smoke')) {
      const { runBrowserSmoke } = await import('../tests/browser-smoke');
      runBrowserSmoke(game);
    }
  } catch (error) {
    console.error('[Kerala Flood Rescue] Startup failed:', error);
    app.innerHTML = '<div class="loading"><div><h2>Unable to launch</h2><p>This game needs a desktop browser with WebGL2 enabled.</p><p id="startup-error"></p><button onclick="location.reload()">TRY AGAIN</button></div></div>';
    document.querySelector('#startup-error')!.textContent = error instanceof Error ? error.message : String(error);
  }
}
void boot();
