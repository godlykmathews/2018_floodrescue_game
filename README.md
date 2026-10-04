# Kerala Flood Rescue

A playable 3D rescue game inspired by the 2018 Kerala floods, built with plain TypeScript, Vite, Three.js, and WebGL. The flooded village is fictional. This upgrade extends the original prototype and keeps its boat handling, chase camera, water, rain, asset loader, and collision systems.

## Run

Use Node.js 20.19+ or 22.12+ and a desktop browser with WebGL2.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Choose **START RESCUE** for Level 1, or **LEVEL SELECT → RISING WATER → START RESCUE** for the two-trip demonstration. Starting from the menu plays `public/Intro_Video.mp4` in full frame, with its original audio/subtitles. Use **SKIP INTRO**, **Space**, or **Escape** to continue early. Audio follows the session toggle. The film pauses when the tab loses focus, and a missing/unplayable video falls through to the mission. Next Level and Restart bypass the film. The selected level’s briefing follows for 4.5 seconds; Space skips it.

```sh
npm test        # Gameplay, loader, state, level, crew, and hazard tests
npm run build   # TypeScript check and production output in dist/
npm run preview # Serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Reverse |
| A / Left, D / Right | Steer |
| Space | Brake |
| E | Rescue / disembark when prompted |
| C | Chase / overview camera |
| R | Restart the current level |
| Escape | Pause / resume |

The boat has momentum and sideways drift. Brake before reaching a rescue point and point the bow toward the waiting people. A rescue needs a distance under 5.4 m, speed under 1.25 m/s, and roughly correct alignment. Hold Space while positioning the boat.

## Rescue loop

The fisherman stays aboard and does not count toward the three-passenger limit. Press E once per survivor. Each person visibly boards over two seconds, moves into a distinct seat, and stays attached to the boat while it turns and bobs.

A full boat cannot collect a fourth person. Return to the green relief landing, approach the dock slowly, and press E to disembark. Passengers leave one at a time and remain visible on the camp deck. Head out again until everyone is delivered. Arriving at camp alone does not automatically unload anyone.

| Level | Difficulty | People / locations | Minimum trips |
| --- | --- | --- | --- |
| 01 — The First Call | Easy | 3 at the terrace | 1 |
| 02 — Rising Water | Medium | 2 terrace, 1 anchored log, 3 roof | 2 |
| 03 — Against the Current | Hard | 3 at each location | 3 |

All levels are unlocked. Configuration supports locking them later. Debris, current, rain, and fog increase with difficulty. Current weakens near the rescue and relief approaches. Strong collisions reduce integrity and give a small camera reaction; gentle contact is forgiving. At zero integrity, restart from the failure screen. There is no countdown: elapsed time and damage contribute to the final star rating.

Escape pauses boat motion, transfers, mission time, and weather. Switching away from the game or losing the WebGL context also pauses simulation and clears held keys. Results show people delivered, unloading trips, elapsed mission time, boat integrity, and rating. Continue with Next Level, Retry, or Main Menu.

## Audio

Music integration is deferred. Quiet generated rain/water ambience and short rescue, completion, and thunder cues are available after the start gesture. Audio On/Off is remembered within the browser session. The menu itself never starts audio.

Future recordings go in `public/audio/`; see its README and the `AUDIO_ASSETS` / `AUDIO_VOLUMES` mappings in `src/game/AudioManager.ts`. Null mappings make no requests, and missing configured recordings leave playable generated fallbacks. No BGM or third-party audio is bundled.

## Architecture and assets

- `Game.ts`: renderer, input, application flow and existing runtime integration.
- `GameStateManager.ts`, `LevelManager.ts`: explicit screen/simulation states and three level configurations.
- `RescueMission.ts`, `PassengerManager.ts`, `SurvivorManager.ts`: capacity, rescue locations, transfers, delivery counts, timing and integrity.
- `Boat.ts`, `Character.ts`: permanent driver, three named seat transforms, reusable character instances and seated pose.
- `BoatController.ts`, `CameraController.ts`: original arcade motion and camera, extended with optional current and bounded impact feedback.
- `World.ts`, `Water.ts`, `Rain.ts`, `Wake.ts`, `ReliefCamp.ts`: village, hazards and atmosphere.
- `UI.ts`, `AudioManager.ts`: DOM menus/HUD and gesture-unlocked audio.
- `AssetLoader.ts`: cached asynchronous GLB sources, `SkeletonUtils.clone`, normalization, loading progress and warned fallbacks.

Original GLBs are preserved in `models/`. The boat's bow originally faces +Z, so its model is rotated by π for the game's −Z forward direction. The operator uses the supplied sitting-man skeleton and seated idle clip. Rescue groups mix farmers and women, with independent standing, seated and log-gripping poses; each level includes women. A mother and child already sheltered at camp are decorative NPCs and do not count toward the mission or passenger capacity.

The playable water now extends to ±88 m (previously ±57 m), with 15 houses, 24 trees and three hills framing the valley. The original central routes remain intact, with outer neighbourhoods to explore. Site B is an anchored scanned log: people hold on in the water, release their grip, and visibly climb into the boat. Broader waves move the boat, floating logs and wakes visually without changing the stable planar boat physics.

Large scans have compact runtime derivatives under `public/models/` with reduced geometry and texture sizes; originals remain untouched. This includes the log, hills, mansion, women and mother/child. Tiny-house and driver materials were converted to supported PBR while retaining their textures. Asset normalization refreshes cloned skeleton bounds before sizing the sitting-man rig.

The boat, original house, farmer, tree and grass assets are referenced by Vite; compact derived assets are copied from `public/models/` into the build. Each unique GLB is requested once; instances reuse source textures. A failed asset warns clearly and supplies playable fallback geometry.

## Browser verification

Development-only test URLs:

- `/?smoke=1`: selects Level 2 through its menu, then uses keyboard events and real boat movement to collect three people, attempt a fourth, unload, return, collect the remaining three, and deliver all six in two trips. It verifies scene visibility, seat parenting and people remaining at camp. A compact status overlay reports PASS/FAIL and average frame rate. Allow about five minutes; keep the tab active.
- `/?recovery=1`: verifies Escape pause/resume, mission-time freezing, focus loss, real WebGL context loss/restoration, cleared throttle and movement after recovery.

`/?camp-view=1` seeds a fixed first-delivery scene for checking camp visibility when the chase camera looks through the canopy. It is a render fixture, not a playthrough; C toggles view and R returns to a normal mission.

`/?world-view=log`, `/?world-view=crew` and `/?world-view=wide` are additional render fixtures for log survivors, the loaded boat and the expanded area. They are not playthroughs; R returns to a normal mission.

These helpers are excluded from production builds. Unit tests also cover all three level populations, the complete nine-person/three-trip mission, restart during every survivor state, failure, cached loading/fallbacks, collision cooldown, fair current, and moving debris bounds.
