import type { Game } from '../src/game/Game';

/** Fixed render fixtures, not gameplay smoke tests. R exits into normal play. */
export function showWorldView(game: Game, view: string) {
  game.startLevel(view === 'log' ? 3 : 2); game.skipIntro();
  const boat = game.boat.controller;
  if (view === 'crew') {
    for (const person of game.mission.survivors.slice(0, 3)) {
      boat.position.set(person.position.x, 0, person.position.z + 4);
      boat.yaw = 0; boat.forward.set(0, 0, -1); boat.velocity.set(0, 0, 0);
      game.boat.update(0);
      if (!game.mission.interact()) throw new Error(`Crew fixture could not board ${person.id}`);
      game.mission.update(2);
    }
    boat.position.set(2, 0, 13);
  } else if (view === 'log') boat.position.set(-15, 0, 4.2);
  else boat.position.set(0, 0, 46);
  boat.yaw = 0; boat.forward.set(0, 0, -1); boat.velocity.set(0, 0, 0);
  game.boat.update(0); game.wake.reset();
  game.cameraController.overview = view === 'wide';
  game.cameraController.update(0, boat, true);
  console.info(`[World view] ${view} render fixture. WASD, E and camera controls remain available. R restarts.`);
}
