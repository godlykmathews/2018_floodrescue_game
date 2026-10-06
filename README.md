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

On mobile or touch screens, hold the four arrow icons at the bottom left to accelerate, reverse and steer. Two fingers can accelerate and steer together; releasing a touch, pausing or switching away clears the held direction. Tap the highlighted **E / action prompt** to treat or rescue survivors, unload passengers, donate, or switch vehicles when available. While flying, hold **RISE** or **DESCEND** on the right to control altitude (Space / Shift); these buttons appear only for the helicopter.

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

## Rooftop helicopter

Follow the cyan **H / HELIPAD DOCK** marker to the brutalist building on the southwest side of the village. Stop an **empty boat** in the dock ring and press **E** to transfer to the rooftop helicopter. The camera travels up over two seconds; the boat stays parked in its exact position. Deliver passengers before switching. Medical kits, coins, survivors and mission progress carry over.

| Flight key | Action |
| --- | --- |
| Space | Rise / take off |
| W / S (Up / Down) | Fly forward / reverse |
| A / D (Left / Right) | Turn |
| Q | Hover / brake |
| Shift | Descend |
| C | Chase / higher view |
| E | Return to the boat after landing |

Lift off first; forward movement becomes available above the village roof clearance (20 m). To return, slow with Q above the rooftop H and hold Shift. The final descent gently centers the aircraft on the pad. E works after touchdown, never in midair. The helicopter is currently for scouting; survivor boarding and delivery remain boat missions. Escape pauses flight, transfers and the mission clock. Restart returns both vehicles to their starting positions.

The helipad is supported by the actual flat roof of `brutalist_building.glb`, with an external stairway and water-level dock. A compact derivative strips unrelated plants and ground while preserving the building. The supplied `odz-20a_universal_helicopter_20a.glb` has animated rotor nodes and uses the supplied rotor recording. Boat handling is unchanged.

## First aid and camp support

Drive close to floating medical kits and heart-shaped coins to collect them. Kits use the supplied `first_aid_kit.glb`; coins use `life-up_heart_-_super_mario_odyssey.glb`. Each heart-shaped pickup contributes 25 or 50 coins to your held balance for donation at camp. Pickups do not use passenger seats.

An amber medical cross marks an injured survivor. The levels include 1, 2 and 3 injured people respectively. Stop and align as usual, then press **E** to give first aid: a visible kit moves toward the survivor over 1.6 seconds, and one kit is consumed when treatment finishes. Press **E** again to board them. If you have no kit, the destination marker points to the nearest uncollected kit. There are six reachable kits, more than the mission needs, and no injury countdown.

At camp, recovered coins are donated when you press **E** to unload. You can also stop in the camp zone and press **E** to donate without passengers. The HUD and final statistics show the donated total and people treated; funded supply crates appear on the camp deck. Donations are optional support, separate from the existing goal of bringing every survivor to safety. Restart resets all pickups, treatments and donations.

The newer environment assets add drifting fallen trees, three partly submerged cars, and a dog, cat and chickens on supported dry refuges. Trees and cars have collision proxies. Animals are ambient scene inhabitants, not additional passengers or mission objectives. The source animal models have no animation clips and remain in their authored poses.

## Audio

The supplied wave recording loops quietly with generated rain, and the helicopter recording plays while flying. Its steady middle section is looped to avoid the faded ends. All sound starts after a user gesture, follows pause and focus changes, and respects the session Audio On/Off setting. BGM remains deferred.

Waiting survivors occasionally call for help when the boat is within 18 metres. The first call has a random 5–9 second approach delay; subsequent calls share one random 25–40 second cooldown across all groups. The short clip never loops or overlaps. It fades with distance and stops outside range, during rescue/treatment/unloading, helicopter use, pause, or mute. People aboard or safe at camp remain silent.

Recordings are decoded once and reused. Missing files warn clearly and leave the game playable. See `public/audio/README.md` and the audio mappings for filenames and mix settings. Generated rescue, completion, and thunder cues remain available.

## Architecture and assets

- `Helicopter.ts`, `HelicopterController.ts`, `Helipad.ts`, `VehicleTransfer.ts`, `VehicleCamera.ts`: flight, rooftop geometry, safe vehicle transfer and its camera.
- `Game.ts`: renderer, input, application flow and existing runtime integration.
- `GameStateManager.ts`, `LevelManager.ts`: explicit screen/simulation states and three level configurations.
- `RescueMission.ts`, `PassengerManager.ts`, `SurvivorManager.ts`: capacity, rescue locations, transfers, delivery counts, timing and integrity.
- `Boat.ts`, `Character.ts`: permanent driver, three named seat transforms, reusable character instances and seated pose.
- `BoatController.ts`, `CameraController.ts`: original arcade motion and camera, extended with optional current and bounded impact feedback.
- `World.ts`, `Water.ts`, `Rain.ts`, `Wake.ts`, `ReliefCamp.ts`: village, hazards and atmosphere.
- `AidSupplies.ts`: cached kit and heart-shaped coin visuals, proximity pickups, treatment parcel, held kits/coins and camp donations.
- `UI.ts`, `AudioManager.ts`, `SurvivorCalls.ts`: DOM menus/HUD, gesture-unlocked audio and nearby survivor call timing.
- `AssetLoader.ts`: cached asynchronous GLB sources, `SkeletonUtils.clone`, normalization, loading progress and warned fallbacks.

Original GLBs are preserved in `models/`. The boat's bow originally faces +Z, so its model is rotated by π for the game's −Z forward direction. The operator uses the supplied sitting-man skeleton and seated idle clip. Rescue groups mix farmers and women, with independent standing, seated and log-gripping poses; each level includes women. A mother and child already sheltered at camp are decorative NPCs and do not count toward the mission or passenger capacity.

The playable water now extends to ±88 m (previously ±57 m), with 15 houses, 13 trees and three hills framing the valley. Five scattered trees use the supplied `tropical_palm_tree.glb`, mixed with eight original trees. Palms are scaled to 12–14 m and anchored at their actual submerged trunks so their collision footprints stay aligned and existing routes remain clear. The original central routes remain intact, with outer neighbourhoods to explore. Site B is an anchored scanned log: people hold on in the water, release their grip, and visibly climb into the boat. Broader waves move the boat, floating logs and wakes visually without changing the stable planar boat physics.

Large scans have compact runtime derivatives under `public/models/` with reduced geometry and texture sizes; originals remain untouched. This includes the log, hills, mansion, women and mother/child. Tiny-house and driver materials were converted to supported PBR while retaining their textures. Asset normalization refreshes cloned skeleton bounds before sizing the sitting-man rig.

The boat, original house, farmer, tree, palm and grass assets are referenced by Vite; compact derived assets are copied from `public/models/` into the build. Each unique GLB is requested once; instances reuse source textures. A failed asset warns clearly and supplies playable fallback geometry.

## Browser verification

Development-only test URLs:

- `/?touch-smoke=1`: at a mobile viewport, run the pointer-input check for forward/reverse movement, simultaneous steering, cancellation, pause/focus/restart resets and keyboard coexistence. It also checks clickable treatment/rescue/unloading and helicopter transfer, rise, descent and return controls using fixed approach positions and the live simulation; this is an input check, not a route-navigation playthrough. `tests/mobile-preview.html` provides portrait and landscape preview frames when device emulation is unavailable.

- `/?smoke=1`: selects Level 2 through its menu, then uses keyboard events and real boat movement to collect three people, attempt a fourth, unload, return, collect the remaining three, and deliver all six in two trips. It also collects supplies using real boat movement, treats both injured survivors, donates recovered coins, and verifies scene visibility, seat parenting and people remaining at camp. A compact status overlay reports PASS/FAIL and average frame rate. Allow about five minutes; keep the tab active.
- `/?audio-smoke=1`: click RUN AUDIO CHECK to exercise actual recordings, nearby help timing, distance limits, mute/pause and rotor looping in a fixed audio fixture.
- `/?helicopter-smoke=1`: drives from the normal spawn to the helipad, switches, flies, pauses, returns and lands, switches back, and restarts using real keyboard input. Verifies parked-boat and mission/supply preservation.
- `/?world-view=helipad`: fixed dock view for inspecting the brutalist roof and switching manually; a render fixture, not a playthrough.
- `/?recovery=1`: verifies Escape pause/resume, mission-time freezing, focus loss, real WebGL context loss/restoration, cleared throttle and movement after recovery.

`/?camp-view=1` seeds a fixed first-delivery scene for checking camp visibility when the chase camera looks through the canopy. It is a render fixture, not a playthrough; C toggles view and R returns to a normal mission.

`/?world-view=log`, `/?world-view=crew` and `/?world-view=wide` are additional render fixtures for log survivors, the loaded boat and the expanded area. The `aid`, `animals`, `car`, `tree` and `palm` values focus on the newer interactions and assets. They are not playthroughs; R returns to a normal mission.

These helpers are excluded from production builds. Unit tests also cover all three level populations, the complete nine-person/three-trip mission, restart during every survivor state, failure, cached loading/fallbacks, collision cooldown, fair current, and moving debris bounds.
