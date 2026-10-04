# Optional flood-rescue audio

Music integration is deferred. The game currently generates quiet rain, boat/water
ambience, a low thunder rumble, and restrained rescue/completion tones with Web
Audio. No audio files are requested by default, and no sound or AudioContext is
created before a player clicks START RESCUE (or a level's start button).

To use recorded assets later, put them in this folder and set the corresponding
`AUDIO_ASSETS` value in `src/game/AudioManager.ts`:

| Config key | Suggested public URL | Purpose |
| --- | --- | --- |
| `ambient` | `/audio/ambient-flood.mp3` | Optional future restrained ambience/music loop |
| `rain` | `/audio/rain.mp3` | Continuous environmental rain |
| `boat` | `/audio/boat.mp3` | Boat/oar/water loop; volume follows speed |
| `thunder` | `/audio/thunder.mp3` | Occasional weather cue |
| `rescue` | `/audio/rescue.mp3` | Passenger safely aboard |
| `complete` | `/audio/mission-complete.mp3` | Everyone safely delivered |

Leave a mapping `null` to keep its generated fallback. There is deliberately no
synthetic fallback for `ambient`, so this slot stays silent until configured.
Missing or invalid configured files log a warning and retain generated sound.
Use loopable recordings for rain and boat. `AUDIO_VOLUMES` controls mix levels;
rain should remain more prominent than future background music. Optional assets
are decoded once after the start gesture and reused. No third-party audio is
bundled, so add recordings you have permission to use.

Integration:

- Create one `AudioManager`; read `enabled` for menu labels.
- Call `void audio.unlock()` **directly inside the real start click handler**.
- Call `setPlaying(true)` during PLAYING, RESCUING and UNLOADING; use `false` for
  menus, intros, pause, focus/context loss, results, and failure.
- Call `update(boatSpeed)` each gameplay frame and `play('rescue')` after boarding.
- On completion, call `setPlaying(false)` **before** `play('complete')` so the
  completion cue plays over the quiet result screen.
- `play('thunder')` is available for occasional Level 3 weather. Effects other
  than completion are suppressed outside gameplay.
- `toggle()` mutes everything and returns the new setting. Session storage keeps
  the preference within this browser session; it also works with storage denied.
- `dispose()` aborts pending loads, stops sources, and closes the audio context.

Pause silences the ambience and stops active effects. Starting an audio effect
never unlocks audio on its own. Gameplay remains usable if Web Audio is blocked
or unavailable. This prototype uses a simple stereo mix; spatial audio and BGM
can be added later without changing the mission systems.
