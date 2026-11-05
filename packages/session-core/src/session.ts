import { BodyController } from '../../motion-core/src/index.ts';
import type { MotionInput, PoseFrame, PreviewTransform, TrackingStatus } from '../../motion-core/src/index.ts';
import { advanceGame, createGame, finishGame, gameResult, pauseGame, resumeGame, startGame } from '../../game-core/src/index.ts';
import type { GameState } from '../../game-core/src/index.ts';
import type { PoseSource, SourceIssue, Viewport } from './sources.ts';

export type RoundResult = NonNullable<ReturnType<typeof gameResult>>;
export type SessionSnapshot = {
  game: GameState;
  pose: PoseFrame | null;
  transform: PreviewTransform | null;
  tracking: TrackingStatus;
  confidence: number;
  issue: SourceIssue | null;
  result: RoundResult | null;
};

/** Owns game/input state, never timers or UI. The host supplies a monotonic clock and lifecycle. */
export class MotionSession {
  private readonly source: PoseSource;
  private readonly random: () => number;
  private readonly controller = new BodyController();
  private viewport: Viewport = { width: 300, height: 330 };
  private disposed = false;
  private lastInput: MotionInput | null = null;
  private lastPoseTime = -Infinity;
  private state: SessionSnapshot;

  constructor(source: PoseSource, random: () => number = Math.random) {
    this.source = source;
    this.random = random;
    this.state = { game: createGame(source.kind), pose: null, transform: null,
      tracking: 'lost', confidence: 0, issue: null, result: null };
  }

  get snapshot(): SessionSnapshot { return this.state; }

  setViewport(viewport: Viewport): void {
    if (![viewport.width, viewport.height].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Invalid viewport');
    if (viewport.width === this.viewport.width && viewport.height === this.viewport.height) return;
    this.viewport = { ...viewport };
    this.clearInput();
  }

  private clearInput(): void {
    this.lastInput = null;
    this.lastPoseTime = -Infinity;
    this.controller.reset();
    this.state = { ...this.state, game: { ...this.state.game, lastInput: null, cursor: null },
      pose: null, transform: null, tracking: 'lost', confidence: 0 };
  }

  private stopSource(): boolean {
    let stopped = true;
    try { this.source.stop(); } catch {
      stopped = false;
      this.state = { ...this.state, game: pauseGame(this.state.game, this.state.game.lastTickMs), issue: 'source-failed' };
    }
    this.clearInput();
    return stopped;
  }

  private fail(nowMs: number, issue: SourceIssue): void {
    this.state = { ...this.state, game: pauseGame(this.state.game, nowMs), issue };
    this.stopSource();
  }

  start(nowMs: number): SessionSnapshot {
    if (this.disposed) throw new Error('Session is disposed');
    if (!this.stopSource()) return this.state;
    this.state = { ...this.state, game: startGame(this.state.game, nowMs, this.random), issue: null, result: null };
    try { this.source.start(); } catch { this.fail(nowMs, 'source-failed'); }
    return this.state;
  }

  tick(nowMs: number): SessionSnapshot {
    if (this.disposed || this.state.game.phase !== 'running' || !Number.isFinite(nowMs) || nowMs < this.state.game.lastTickMs) return this.state;
    try {
      const event = this.source.read(nowMs, this.viewport);
      if (event?.kind === 'error') { this.fail(nowMs, event.issue); return this.state; }
      if (event?.kind === 'sample') {
        const { frame, image } = event.sample;
        if (frame.timestampMs > nowMs) { this.fail(nowMs, 'invalid-payload'); return this.state; }
        const transform = { ...image, viewWidth: this.viewport.width, viewHeight: this.viewport.height };
        const result = this.controller.update(frame, nowMs, transform, this.source.kind);
        this.lastInput = result.input;
        this.lastPoseTime = result.status === 'stale' ? -Infinity : frame.timestampMs;
        this.state = { ...this.state, pose: frame.isTracked && result.status !== 'stale' ? frame : null, transform,
          tracking: result.status, confidence: result.input.confidence };
      }
      // UI may tick faster than the detector; reuse a valid sample until expiry without reprocessing it.
      if (nowMs - this.lastPoseTime > 250) {
        this.lastInput = null;
        this.controller.reset();
        this.state = { ...this.state, pose: null, tracking: 'stale', confidence: 0 };
      }
      const game = advanceGame(this.state.game, nowMs, this.lastInput, this.random, this.viewport.width / this.viewport.height);
      this.state = { ...this.state, game, result: gameResult(game) };
      if (game.phase === 'finished') this.stopSource();
    } catch { this.fail(nowMs, 'source-failed'); }
    return this.state;
  }

  pause(nowMs: number): SessionSnapshot {
    if (this.disposed) return this.state;
    const game = pauseGame(this.state.game, nowMs);
    this.state = { ...this.state, game, result: gameResult(game) };
    this.stopSource();
    return this.state;
  }

  resume(nowMs: number): SessionSnapshot {
    if (this.disposed || this.state.game.phase !== 'paused') return this.state;
    if (!this.stopSource()) return this.state;
    this.state = { ...this.state, game: resumeGame(this.state.game, nowMs), issue: null };
    if (this.state.game.phase === 'running') {
      try { this.source.start(); } catch { this.fail(nowMs, 'source-failed'); }
    }
    return this.state;
  }

  finish(nowMs: number): SessionSnapshot {
    if (this.disposed) return this.state;
    const game = finishGame(this.state.game, nowMs);
    this.state = { ...this.state, game, result: gameResult(game) };
    this.stopSource();
    return this.state;
  }

  dispose(): void {
    if (this.disposed) return;
    this.state = { ...this.state, game: pauseGame(this.state.game, this.state.game.lastTickMs) };
    this.stopSource();
    try { this.source.dispose(); } finally { this.disposed = true; }
  }
}
