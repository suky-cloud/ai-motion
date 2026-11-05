import type { MotionInput, Point } from '../../motion-core/src/index.ts';

export type GamePhase = 'idle' | 'running' | 'paused' | 'finished';
export type GameState = {
  phase: GamePhase;
  durationMs: number;
  elapsedMs: number;
  lastTickMs: number;
  lastInput: MotionInput | null;
  lastAcceptedTimestampMs: number;
  cursor: Point | null;
  target: Point | null;
  hitTimesMs: readonly number[];
  score: number;
  validInputMs: number;
  everTracked: boolean;
  source: MotionInput['source'];
  endReason: 'timeout' | 'manual' | null;
};

const FRESHNESS_MS = 250;
export const HIT_RADIUS = 0.075; // Proportion of board width; the UI uses the same geometry.

export function collides(a: Point, b: Point, boardAspect = 1): boolean {
  if (!Number.isFinite(boardAspect) || boardAspect <= 0) throw new RangeError('Invalid board aspect');
  return Math.hypot(a.x - b.x, (a.y - b.y) / boardAspect) <= HIT_RADIUS;
}

export function nextTarget(random: () => number, cursor: Point | null): Point {
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random source must return [0,1)');
    const target = { x: 0.2 + value * 0.6, y: 0.5 };
    if (!cursor || Math.abs(target.x - cursor.x) > 0.18) return target;
  }
  return { x: cursor && cursor.x < 0.5 ? 0.8 : 0.2, y: 0.5 };
}

export function createGame(source: MotionInput['source'] = 'pose', durationMs = 30_000): GameState {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError('Invalid game duration');
  return {
    phase: 'idle', durationMs, elapsedMs: 0, lastTickMs: 0, lastInput: null,
    lastAcceptedTimestampMs: -Infinity, cursor: null, target: null, hitTimesMs: [],
    score: 0, validInputMs: 0, everTracked: false, source, endReason: null,
  };
}

export function startGame(state: GameState, nowMs: number, random: () => number = Math.random): GameState {
  if (!Number.isFinite(nowMs) || nowMs < 0) throw new RangeError('Invalid clock');
  return { ...createGame(state.source, state.durationMs), phase: 'running', lastTickMs: nowMs, target: nextTarget(random, null) };
}

function usable(input: MotionInput | null, nowMs: number, source: MotionInput['source']): input is MotionInput {
  return !!input && input.source === source && input.isValid && Number.isFinite(input.confidence) && input.confidence >= 0.5 && input.confidence <= 1 &&
    Number.isFinite(input.timestampMs) && input.timestampMs >= 0 && input.timestampMs <= nowMs && nowMs - input.timestampMs <= FRESHNESS_MS &&
    Number.isFinite(input.x) && Number.isFinite(input.y) && input.x >= 0 && input.x <= 1 && input.y >= 0 && input.y <= 1;
}

export function advanceGame(state: GameState, nowMs: number, input: MotionInput | null,
  random: () => number = Math.random, boardAspect = 1): GameState {
  if (state.phase !== 'running' || !Number.isFinite(nowMs) || nowMs < state.lastTickMs) return state;
  const delta = Math.min(nowMs - state.lastTickMs, state.durationMs - state.elapsedMs);
  const intervalEnd = state.lastTickMs + delta;
  const validDelta = usable(state.lastInput, state.lastTickMs, state.source)
    ? Math.max(0, Math.min(intervalEnd, state.lastInput.timestampMs + FRESHNESS_MS) - state.lastTickMs) : 0;
  const next: GameState = {
    ...state, elapsedMs: state.elapsedMs + delta, lastTickMs: nowMs,
    validInputMs: state.validInputMs + validDelta,
  };
  if (next.elapsedMs >= next.durationMs) return { ...next, phase: 'finished', endReason: 'timeout', lastInput: null };
  if (!usable(input, nowMs, state.source) || input.timestampMs < state.lastAcceptedTimestampMs) {
    return { ...next, lastInput: null, cursor: null };
  }
  // Repeated samples may keep a visible cursor until expiry, but cannot score twice.
  if (input.timestampMs === state.lastAcceptedTimestampMs) return { ...next, lastInput: { ...input } };
  next.lastAcceptedTimestampMs = input.timestampMs;
  next.lastInput = { ...input };
  // Motion Catch is a left/right game. Other games can reuse the full 2D MotionInput.
  next.cursor = { x: input.x, y: 0.5 };
  next.everTracked = true;
  if (next.target && collides(next.cursor, next.target, boardAspect)) {
    next.hitTimesMs = [...state.hitTimesMs, next.elapsedMs];
    next.score += 10;
    next.target = nextTarget(random, next.cursor);
  }
  return next;
}

export function pauseGame(state: GameState, nowMs: number): GameState {
  const next = advanceGame(state, nowMs, state.lastInput);
  return next.phase === 'running' ? { ...next, phase: 'paused', lastInput: null, cursor: null } : next;
}

export function resumeGame(state: GameState, nowMs: number): GameState {
  if (state.phase !== 'paused' || !Number.isFinite(nowMs) || nowMs < state.lastTickMs) return state;
  return { ...state, phase: 'running', lastTickMs: nowMs, lastInput: null, cursor: null };
}

export function finishGame(state: GameState, nowMs: number): GameState {
  const next = advanceGame(state, nowMs, state.lastInput);
  return next.phase === 'running' || next.phase === 'paused'
    ? { ...next, phase: 'finished', endReason: 'manual', lastInput: null, cursor: null } : next;
}

export function gameResult(state: GameState) {
  if (state.phase !== 'finished') return null;
  const hits = state.hitTimesMs.length;
  return {
    score: state.score, hits, durationMs: state.elapsedMs,
    averageHitIntervalMs: hits >= 2 ? (state.hitTimesMs[hits - 1] - state.hitTimesMs[0]) / (hits - 1) : null,
    validInputMs: state.validInputMs, everTracked: state.everTracked, source: state.source, endReason: state.endReason,
  };
}
