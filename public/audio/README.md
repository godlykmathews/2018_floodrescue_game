# Flood-rescue audio

The supplied recordings are connected through `src/game/AudioManager.ts`.
Audio starts only after a player clicks START RESCUE; menus and the mission
briefing stay silent. Music/BGM remains deferred.

| File | Use |
| --- | --- |
| `waves_sound.mp3` | Continuous flood-water ambience alongside generated rain. Quieter while flying. |
| `dragon-studio-helicopter-sound-8d-372463.mp3` | Rotor ambience while controlling the helicopter. Loaded on first use; loops 0.7–8.5 seconds to omit the recording's faded ends. |
| `help_help.mp3` | Short, non-looping call from a nearby waiting survivor. |

Help calls use one global schedule in `SurvivorCalls.ts`: stay within 18 metres
of a waiting survivor for a randomized 5–9 seconds before the first call, then
allow at least 25–40 seconds between calls. Nearby groups share that cooldown,
so several people cannot shout over each other. Calls get quieter with distance
and stop outside hearing range or when that person starts boarding. They do
not play during treatment, unloading, helicopter flight, vehicle switching,
menus, pause, or mute. Safe survivors and passengers never call. Restart resets
the schedule; pauses do not accumulate overdue calls.

Recordings are decoded once and reused. All audio respects the session audio
toggle, Escape pause, focus loss, and graphics recovery. Missing recordings
log a warning; rain and boat ambience retain generated fallbacks. Missing help
audio stays silent rather than producing an unrelated fallback tone.

`AUDIO_ASSETS` maps wave/help recordings and optional future rain, boat, thunder,
rescue, completion, and ambient/music files. Leave unused mappings `null`.
`AUDIO_VOLUMES` controls the mix; the rotor recording has a quieter source level
than the generated rain, so gain values alone do not measure perceived loudness.

Integration:

- Call `audio.unlock()` from a real start click, never on page load.
- `setPlaying(false)` silences loops and stops effects on menus/pause/results.
- `setVehicle('boat' | 'helicopter')` changes vehicle ambience.
- `update(boatSpeed)` controls the original boat sound.
- `playHelp(distance)` starts one decoded nearby voice; `updateHelpDistance(null)`
  stops it when the caller is no longer eligible. Game updates its distance every frame.
- `play('rescue' | 'complete' | 'thunder')` retains the existing restrained cues.
- `dispose()` aborts downloads, stops sources, and closes the audio context.

The developer-only `/?audio-smoke=1` fixture exposes RUN AUDIO CHECK. Click it
to test actual browser decoding and source playback, near/far calls, cooldown,
mute/pause, and rotor looping. Its fixed positions are audio test fixtures, not
a boat-navigation playthrough.
