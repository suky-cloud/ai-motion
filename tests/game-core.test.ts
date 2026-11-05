import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceGame, collides, createGame, finishGame, gameResult, nextTarget, pauseGame, resumeGame, startGame } from '../packages/game-core/src/index.ts';
import type { MotionInput } from '../packages/motion-core/src/index.ts';
import { BodyController } from '../packages/motion-core/src/index.ts';
import { simulatedPose } from '../packages/motion-core/src/simulation.ts';

const sample = (timestampMs: number, x = 0.5, y = 0.5): MotionInput => ({
  timestampMs, x, y, confidence: 0.9, isValid: true, source: 'simulation',
});
const start = () => startGame(createGame('simulation'), 0, () => 0.5);

test('collision uses circular screen geometry, including tall portrait boards', () => {
  assert.equal(collides({ x: 0.5, y: 0.5 }, { x: 0.575, y: 0.5 }), true);
  assert.equal(collides({ x: 0.5, y: 0.5 }, { x: 0.58, y: 0.5 }), false);
  assert.equal(collides({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.55 }, 0.5), false);
});

test('targets stay reachable and the next target never overlaps the current cursor', () => {
  for (let value = 0; value < 1; value += 0.01) {
    const target = nextTarget(() => value, { x: 0.5, y: 0.5 });
    assert.ok(target.x >= 0.2 && target.x <= 0.8);
    assert.equal(target.y, 0.5);
    assert.ok(Math.abs(target.x - 0.5) > 0.18);
  }
  assert.throws(() => nextTarget(() => NaN, null), RangeError);
});

test('one sample scores once, respawns away from the cursor and never mutates old state', () => {
  const initial = start();
  Object.freeze(initial);
  const hit = advanceGame(initial, 10, sample(10), () => 0.5);
  assert.equal(hit.score, 10); assert.equal(hit.hitTimesMs.length, 1);
  assert.equal(initial.score, 0); assert.equal(initial.hitTimesMs.length, 0);
  const replay = advanceGame(hit, 20, sample(10, hit.target!.x), () => 0.5);
  assert.equal(replay.score, 10);
});

test('30-second deadline freezes score and prevents a final hit at the exact boundary', () => {
  const state = start();
  const ended = advanceGame(state, 30_000, sample(30_000), () => 0.5);
  assert.equal(ended.phase, 'finished'); assert.equal(ended.score, 0);
  assert.equal(gameResult(ended)!.durationMs, 30_000);
  assert.equal(advanceGame(ended, 31_000, sample(31_000)), ended);
});

test('pause excludes wall-clock waiting and resume requires fresh input', () => {
  let state = advanceGame(start(), 1000, sample(1000, 0.3));
  state = pauseGame(state, 2000);
  assert.equal(state.elapsedMs, 2000);
  assert.equal(advanceGame(state, 5000, sample(5000)), state);
  state = resumeGame(state, 10_000);
  assert.equal(state.cursor, null);
  state = advanceGame(state, 11_000, null);
  assert.equal(state.elapsedMs, 3000); assert.equal(state.score, 0);
});

test('input loss clears cursor, expires old input and only accumulates valid input time', () => {
  let state = advanceGame(start(), 0, sample(0, 0.3));
  state = advanceGame(state, 1000, sample(0, 0.3));
  assert.equal(state.cursor, null); assert.equal(state.validInputMs, 250);
  state = advanceGame(state, 1500, sample(1500, 0.3));
  state = advanceGame(state, 1600, { ...sample(1600), isValid: false });
  assert.equal(state.validInputMs, 350); assert.equal(state.cursor, null);
});

test('invalid, future, wrong-source, low-confidence and out-of-order inputs cannot score', () => {
  for (const input of [
    { ...sample(10), x: NaN }, { ...sample(10), x: 2 }, { ...sample(10), confidence: 0.2 },
    { ...sample(10), source: 'pose' as const }, sample(11), { ...sample(10), timestampMs: -1 },
  ]) assert.equal(advanceGame(start(), 10, input).score, 0);
  const state = advanceGame(start(), 100, sample(100, 0.2));
  assert.equal(advanceGame(state, 110, sample(90)).score, 0);
  assert.equal(advanceGame(state, 90, sample(90)), state);
});

test('manual finish and restart correctly isolate results, targets, timer and input', () => {
  let state = advanceGame(start(), 100, sample(100), () => 0.5);
  state = finishGame(pauseGame(state, 500), 50_000);
  const result = gameResult(state)!;
  assert.equal(result.durationMs, 500); assert.equal(result.hits, 1);
  assert.equal(result.averageHitIntervalMs, null); assert.equal(result.endReason, 'manual');
  const fresh = startGame(state, 60_000, () => 0.1);
  assert.equal(fresh.score, 0); assert.equal(fresh.elapsedMs, 0);
  assert.equal(fresh.everTracked, false); assert.equal(fresh.lastInput, null);
  assert.equal(fresh.hitTimesMs.length, 0); assert.equal(gameResult(fresh), null);
});

test('average hit interval is calculated from consecutive active-time hit timestamps', () => {
  let state = advanceGame(start(), 100, sample(100), () => 0.5);
  state = advanceGame(state, 600, sample(600, state.target!.x), () => 0.5);
  const result = gameResult(finishGame(state, 1000))!;
  assert.equal(result.score, 20); assert.equal(result.averageHitIntervalMs, 500);
});

test('left/right gameplay projects body height onto the target lane', () => {
  const state = advanceGame(start(), 100, sample(100, 0.5, 0.25), () => 0.5);
  assert.equal(state.cursor!.y, 0.5);
  assert.equal(state.score, 10);
});

test('long stalled tick clips tracked duration to freshness and total duration', () => {
  let state = advanceGame(start(), 0, sample(0, 0.3));
  state = advanceGame(state, 60_000, null);
  assert.equal(state.elapsedMs, 30_000); assert.equal(state.validInputMs, 250);
});

test('synthetic full-body input drives a complete 30-second game through the real controller', () => {
  const controller = new BodyController();
  let state = start();
  const transform = { sourceWidth: 300, sourceHeight: 500, viewWidth: 300, viewHeight: 500,
    rotation: 0 as const, mirrored: false, resizeMode: 'cover' as const };
  for (let now = 0; now <= 30_000; now += 50) {
    const desired = state.target ?? { x: 0.5, y: 0.5 };
    const { input } = controller.update(simulatedPose(desired, now), now, transform, 'simulation');
    state = advanceGame(state, now, input, () => 0.5, 0.6);
  }
  assert.equal(state.phase, 'finished');
  assert.ok(state.score > 100); assert.equal(state.score, state.hitTimesMs.length * 10);
  assert.equal(state.validInputMs, 30_000); assert.equal(gameResult(state)!.source, 'simulation');
});
