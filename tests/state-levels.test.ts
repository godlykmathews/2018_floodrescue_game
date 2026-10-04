import assert from 'node:assert/strict';
import test from 'node:test';
import { GameStateManager } from '../src/game/GameStateManager.ts';
import { LEVELS, LevelManager, missionRating } from '../src/game/LevelManager.ts';

function playing() {
  const state = new GameStateManager();
  state.transition('LEVEL_INTRO');
  state.transition('PLAYING');
  return state;
}

test('story video keeps simulation frozen until the selected level briefing finishes', () => {
  const state = new GameStateManager();
  state.transition('STORY_VIDEO');
  assert.equal(state.state, 'STORY_VIDEO');
  assert.equal(state.simulating, false);
  state.pause();
  state.resume();
  assert.equal(state.state, 'STORY_VIDEO', 'game pause must not convert a cinematic into gameplay');
  state.transition('LEVEL_INTRO');
  assert.equal(state.simulating, false);
  state.transition('LEVEL_INTRO');
  assert.equal(state.state, 'LEVEL_INTRO', 'an identical transition remains idempotent');
  state.transition('PLAYING');
  assert.equal(state.simulating, true);
});

test('story video can return to the main menu and replay without starting simulation', () => {
  const state = new GameStateManager();
  state.transition('STORY_VIDEO');
  state.transition('MAIN_MENU');
  assert.equal(state.state, 'MAIN_MENU');
  assert.equal(state.simulating, false);
  state.transition('STORY_VIDEO');
  assert.equal(state.state, 'STORY_VIDEO');
  assert.equal(state.simulating, false);
});

test('story video cannot bypass the briefing or enter gameplay transfer and outcome states', () => {
  const state = new GameStateManager();
  state.transition('STORY_VIDEO');
  for (const destination of ['PLAYING', 'RESCUING', 'UNLOADING', 'PAUSED', 'LEVEL_COMPLETE', 'LEVEL_FAILED'] as const) {
    assert.throws(() => state.transition(destination), /Invalid game state/);
    assert.equal(state.state, 'STORY_VIDEO');
    assert.equal(state.simulating, false);
  }
});

test('game opens at the main menu and runs only after its level introduction', () => {
  const state = new GameStateManager();
  assert.equal(state.state, 'MAIN_MENU');
  assert.equal(state.simulating, false);
  state.transition('LEVEL_INTRO');
  assert.equal(state.simulating, false);
  state.transition('PLAYING');
  assert.equal(state.simulating, true);
  state.transition('RESCUING');
  assert.equal(state.simulating, true, 'boarding animation requires simulation');
  state.transition('PLAYING');
  state.transition('UNLOADING');
  assert.equal(state.simulating, true, 'disembarking animation requires simulation');
  state.transition('LEVEL_COMPLETE');
  assert.equal(state.simulating, false);
  state.transition('LEVEL_INTRO');
  assert.equal(state.simulating, false, 'next-level briefing must not drive the boat');
});

test('invalid state transitions throw without changing the current state', () => {
  const state = new GameStateManager();
  assert.throws(() => state.transition('PLAYING'), /Invalid game state/);
  assert.equal(state.state, 'MAIN_MENU');
  state.transition('LEVEL_INTRO');
  assert.throws(() => state.transition('LEVEL_COMPLETE'), /Invalid game state/);
  assert.equal(state.state, 'LEVEL_INTRO');
  state.transition('PLAYING');
  state.transition('RESCUING');
  assert.throws(() => state.transition('UNLOADING'), /Invalid game state/);
  assert.equal(state.state, 'RESCUING');
});

test('pause freezes simulation and resumes the exact active transfer state', () => {
  for (const active of ['PLAYING', 'RESCUING', 'UNLOADING'] as const) {
    const state = playing();
    state.transition(active);
    state.pause();
    assert.equal(state.state, 'PAUSED');
    assert.equal(state.simulating, false);
    state.pause();
    assert.equal(state.state, 'PAUSED', 'repeated blur or Escape must not lose the paused state');
    state.resume();
    assert.equal(state.state, active);
    assert.equal(state.simulating, true);
    state.resume();
    assert.equal(state.state, active);
  }
});

test('menus, briefings, completion and failure stay frozen when pause or resume is requested', () => {
  const states = [new GameStateManager(), new GameStateManager(), playing(), playing()];
  states[1].transition('LEVEL_INTRO');
  states[2].transition('LEVEL_COMPLETE');
  states[3].transition('LEVEL_FAILED');
  for (const state of states) {
    const before = state.state;
    state.pause(); state.resume();
    assert.equal(state.state, before);
    assert.equal(state.simulating, false);
  }
});

test('restart and main-menu transitions are allowed during either transfer and while paused', () => {
  for (const active of ['PLAYING', 'RESCUING', 'UNLOADING', 'PAUSED'] as const) {
    for (const destination of ['MAIN_MENU', 'LEVEL_INTRO'] as const) {
      const state = playing();
      if (active === 'PAUSED') state.pause(); else state.transition(active);
      state.transition(destination);
      assert.equal(state.state, destination);
      assert.equal(state.simulating, false);
    }
  }
});

test('the three levels configure 3, 6 and 9 survivors with capacity requiring 1, 2 and 3 trips', () => {
  assert.deepEqual(LEVELS.map(level => level.id), [1, 2, 3]);
  assert.deepEqual(LEVELS.map(level => level.survivors), [3, 6, 9]);
  assert.deepEqual(LEVELS.map(level => level.counts), [[3, 0, 0], [2, 1, 3], [3, 3, 3]]);
  assert.deepEqual(LEVELS.map(level => Math.ceil(level.survivors / 3)), [1, 2, 3]);
  for (const level of LEVELS) {
    assert.equal(level.counts.reduce((sum, count) => sum + count, 0), level.survivors);
    assert.ok(level.counts.every(count => Number.isInteger(count) && count >= 0 && count <= 3));
    assert.ok(level.title.length > 0 && level.briefing.length > 0);
    assert.ok(level.parTime > 0);
    assert.equal(level.unlocked, true, 'development levels should all be selectable');
  }
});

test('difficulty increases current, debris, rain and fog without an aggressive countdown', () => {
  assert.deepEqual(LEVELS.map(level => level.difficulty), ['Easy', 'Medium', 'Hard']);
  for (let index = 1; index < LEVELS.length; index++) {
    const previous = LEVELS[index - 1], level = LEVELS[index];
    assert.ok(level.currentStrength > previous.currentStrength);
    assert.ok(level.debrisCount > previous.debrisCount);
    assert.ok(level.fogDensity > previous.fogDensity);
    assert.ok(level.rainMultiplier > previous.rainMultiplier);
    assert.ok(level.parTime > previous.parTime);
  }
});

test('level selection returns the chosen config and next never wraps after level three', () => {
  const levels = new LevelManager();
  assert.equal(levels.current, LEVELS[0]);
  assert.equal(levels.next, LEVELS[1]);
  assert.equal(levels.select(2), LEVELS[1]);
  assert.equal(levels.current, LEVELS[1]);
  assert.equal(levels.next, LEVELS[2]);
  levels.select(3);
  assert.equal(levels.next, undefined);
  assert.throws(() => levels.select(0), /unavailable/);
  assert.throws(() => levels.select(4), /unavailable/);
  assert.equal(levels.current, LEVELS[2], 'bad selection must preserve the current level');
});

test('future locked levels cannot be selected or offered as next', () => {
  const levels = new LevelManager();
  const second = LEVELS[1], unlocked = second.unlocked;
  try {
    second.unlocked = false;
    assert.equal(levels.next, undefined);
    assert.throws(() => levels.select(2), /unavailable/);
    assert.equal(levels.current, LEVELS[0]);
  } finally {
    second.unlocked = unlocked;
  }
  assert.equal(levels.select(2), second);
});

test('ratings reward completion, preserved integrity and an efficient mission at exact thresholds', () => {
  assert.equal(missionRating(200, 64, 240), 1);
  assert.equal(missionRating(200, 65, 240), 2);
  assert.equal(missionRating(200, 84, 240), 2);
  assert.equal(missionRating(240, 85, 240), 3);
  assert.equal(missionRating(241, 100, 240), 2);
  assert.equal(missionRating(500, 30, 240), 1);
  assert.equal(missionRating(120, 100, 240), 3);
});
