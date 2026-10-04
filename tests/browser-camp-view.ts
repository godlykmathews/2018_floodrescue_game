import type { Game } from '../src/game/Game';

/** Focused render fixture, not a playthrough. Seed a completed first delivery using normal transfers. */
export function showCampView(game: Game) {
  game.startLevel(2); game.skipIntro();
  const boat = game.boat.controller;
  for (const person of game.mission.survivors.slice(0, 3)) {
    boat.position.set(person.position.x, 0, person.position.z + 4);
    boat.yaw = 0; boat.forward.set(0, 0, -1); boat.velocity.set(0, 0, 0);
    game.boat.update(0);
    if (!game.mission.interact()) throw new Error(`Camp fixture could not board ${person.id}`);
    game.mission.update(2);
  }
  boat.position.set(24, 0, 19.1); boat.yaw = Math.PI; boat.forward.set(0, 0, 1);
  game.boat.update(0);
  if (!game.mission.interact()) throw new Error('Camp fixture could not unload');
  for (let i = 0; i < 3; i++) game.mission.update(2);
  boat.yaw = 0; boat.forward.set(0, 0, -1); boat.locked = true;
  game.boat.update(0); game.wake.reset();
  game.cameraController.update(0, boat, true);
  game.camp.updateView(game.camera.position, boat.position, 2);
  console.info('[Camp view] Render fixture: 3 SAFE, driver aboard, leaving camp. C toggles camera. R exits fixture.');
}
