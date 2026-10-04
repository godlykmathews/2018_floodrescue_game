# Kerala Flood Rescue

A small, playable 3D rescue prototype inspired by the 2018 Kerala floods. Built with plain TypeScript, Vite, Three.js, and WebGL. This is a fictional village and a respectful rescue scenario, not a historical reconstruction.

## Run

Requires Node.js 20.19+ or 22.12+ (a current LTS version is recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. A keyboard and a desktop browser with WebGL2 are required.

```sh
npm run build   # Type-check and create dist/
npm run preview # Serve the production build
npm test        # Gameplay checks
```

## Controls

| Key | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Reverse |
| A / Left, D / Right | Steer |
| Space | Brake |
| E | Rescue when in range, facing the survivor, and moving slowly |
| C | Switch chase / overview camera |
| R | Restart mission |

## Play the mission

The mission starts immediately. Head along the flooded central lane toward the amber survivor marker. Hold **Space** as you approach the raised platform, point the bow toward the survivor, and press **E** when prompted. Movement pauses briefly while the survivor boards.

Switching away from the game pauses the mission. Returning to the window resumes it with held keys cleared.

Then head to the green **RELIEF CAMP** marker. Enter its green landing ring slowly to complete the mission. **R** or the completion screen's button starts a fresh mission.

## Verification

`npm test` checks boat motion, collision recovery, rescue safety conditions, boarding, delivery, restart, and loader fallbacks. The development URL `/?smoke=1` runs an automatic full playthrough using keyboard events and normal navigation; it reports success on screen. The development URL `/?recovery=1` checks focus loss and actual WebGL context loss/recovery. Both test helpers are excluded from production builds.

## Assets

Original GLB files remain in `models/`. Vite copies only referenced assets into the production build. Asset normalization is centralized in `src/utils/AssetLoader.ts`; individual models can be swapped without changing gameplay. Failed model loads produce a console warning and playable fallback geometry.

The boat's original pointed bow faces +Z; the game uses −Z forward, so the model is rotated by π. Its length is normalized independently of the oars. The lightweight farmer is used as the survivor. Imported model geometry and textures are shared between clones.

Selected assets: wooden rowing boat, abandoned house, low-poly farmer, Jabami tree, and grass. Original files are preserved without modification.
