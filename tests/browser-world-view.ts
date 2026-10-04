import type { Game } from '../src/game/Game';

/** Fixed render fixtures, not gameplay smoke tests. R exits into normal play. */
export function showWorldView(game: Game, view: string) {
  game.startLevel(view === 'log' ? 3 : 2); game.skipIntro();
  const boat = game.boat.controller;
  if (view === 'crew') {
    game.supplies.kits = 1; // Fixed render fixture, not a collection playthrough.
    for (const person of game.mission.survivors.slice(0, 3)) {
      boat.position.set(person.position.x, 0, person.position.z + 4);
      boat.yaw = 0; boat.forward.set(0, 0, -1); boat.velocity.set(0, 0, 0);
      game.boat.update(0);
      if (person.needsAid) { game.mission.interact(); game.mission.update(1.6); }
      if (!game.mission.interact()) throw new Error(`Crew fixture could not board ${person.id}`);
      game.mission.update(2);
    }
    boat.position.set(2, 0, 13);
  } else if (view === 'log') boat.position.set(-15, 0, 4.2);
  else if (view === 'aid') { boat.position.set(-1.25, 0, -18); game.supplies.kits = 1; }
  else if (view === 'animals') boat.position.set(31, 0, 20.8);
  else if (view === 'car') boat.position.set(39, 0, 17);
  else if (view === 'tree') boat.position.set(6.5, 0, 25.5);
  else boat.position.set(0, 0, 46);
  boat.yaw = view === 'animals' || view === 'car' ? Math.PI : 0;
  boat.forward.set(-Math.sin(boat.yaw), 0, -Math.cos(boat.yaw)); boat.velocity.set(0, 0, 0);
  game.boat.update(0); game.wake.reset();
  game.cameraController.overview = view === 'wide';
  game.cameraController.update(0, boat, true);
  console.info(`[World view] ${view} render fixture. WASD, E and camera controls remain available. R restarts.`);
}
