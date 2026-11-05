import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appReducer, initialAppState } from '../apps/mobile/src/application/state.ts';
import { advanceGame, createGame, finishGame, gameResult, startGame } from '../packages/game-core/src/index.ts';

test('navigation creates fresh screen identities, including home recovery', () => {
  const game = appReducer(initialAppState, { type: 'open', screen: 'simulation' });
  assert.equal(game.route.name, 'simulation');
  const home = appReducer(game, { type: 'home' });
  const next = appReducer(home, { type: 'open', screen: 'simulation' });
  assert.notDeepEqual(game.route, next.route);
  assert.equal(initialAppState.route.name, 'home');
  assert.notEqual(appReducer(home, { type: 'home' }).nextRouteKey, home.nextRouteKey);
});

test('the last completed round survives navigation, copies summary data and can be cleared', () => {
  let round = startGame(createGame('simulation'), 0, () => 0.5);
  round = advanceGame(round, 100, { x: 0.5, y: 0.5, timestampMs: 100, confidence: 1, isValid: true, source: 'simulation' }, () => 0.5);
  const result = gameResult(finishGame(round, 1000))!;
  const stored = appReducer(initialAppState, { type: 'record-result', result, completedAt: '2026-11-05T00:00:00Z' });
  result.score = 10000;
  const camera = appReducer(stored, { type: 'open', screen: 'camera' });
  assert.equal(camera.lastRound!.result.score, 10);
  assert.equal(camera.lastRound!.result.source, 'simulation');
  assert.equal(camera.lastRound!.schemaVersion, 1);
  assert.equal(JSON.stringify(camera.lastRound).includes('landmarks'), false);
  assert.equal(appReducer(camera, { type: 'clear-result' }).lastRound, null);
  assert.equal(initialAppState.lastRound, null);
});
