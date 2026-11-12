import test from "node:test";
import assert from "node:assert/strict";
import {
  DribbleCounter,
  DribbleSession,
  decodeBallFrame,
} from "../packages/basketball-core/src/index.ts";
import type { BallFrame } from "../packages/basketball-core/src/index.ts";
const frame = (time: number, y: number, x = 0.25): BallFrame => ({
  timestampMs: time,
  width: 640,
  height: 480,
  mirrored: false,
  inferenceMs: 20,
  balls: [{ x, y, width: 0.08, height: 0.1, confidence: 0.9 }],
});
const cycle = (session: DribbleSession, start: number, x = 0.25) => {
  for (let t = 0; t < 650; t += 50)
    session.accept(
      frame(start + t, 0.5 - 0.22 * Math.cos((t / 650) * 2 * Math.PI), x),
      start + t,
    );
};
test("ball payload copies declared data, maps front mirror once and rejects malformed input", () => {
  const raw = frame(0, 0.4);
  raw.mirrored = true;
  const parsed = decodeBallFrame(raw);
  assert.equal(parsed.balls[0].x, 0.75);
  assert.equal(decodeBallFrame(parsed).balls[0].x, 0.75);
  raw.balls[0].y = 0.9;
  assert.equal(parsed.balls[0].y, 0.4);
  for (const patch of [
    { width: 0 },
    { timestampMs: NaN },
    { inferenceMs: -1 },
    { mirrored: "yes" },
    { balls: [{ ...raw.balls[0], confidence: 2 }] },
  ])
    assert.throws(() => decodeBallFrame({ ...raw, ...patch }));
});
test("stationary ball and small jitter cannot count dribbles", () => {
  const s = new DribbleSession("count", "simulation");
  s.start(0);
  for (let t = 0; t < 5000; t += 50)
    s.accept(frame(t, 0.5 + 0.005 * Math.sin(t)), t);
  assert.equal(s.result.reps, 0);
});
test("full down and up cycles count once, estimate cadence and streak", () => {
  const s = new DribbleSession("count", "ball");
  s.start(0);
  for (let n = 0; n < 5; n++) cycle(s, n * 650);
  assert.equal(s.result.reps, 5);
  assert.equal(s.result.longestStreak, 5);
  assert.ok(Math.abs(s.result.cadence! - 60000 / 650) < 1);
  assert.ok(s.result.rhythmVariation! < 0.01);
});
test("partial descent alone does not count", () => {
  const c = new DribbleCounter();
  for (const [t, y] of [
    [0, 0.3],
    [100, 0.45],
    [200, 0.6],
    [300, 0.7],
  ])
    c.update(frame(t, y));
  assert.equal(c.reps, 0);
});
test("multiple balls, confidence loss and trajectory jumps break the cycle", () => {
  for (const kind of ["multiple", "lost", "jump"]) {
    const c = new DribbleCounter();
    c.update(frame(0, 0.3));
    c.update(frame(100, 0.5));
    const bad = frame(200, 0.7);
    if (kind === "multiple") bad.balls.push({ ...bad.balls[0], x: 0.8 });
    if (kind === "lost") bad.balls[0].confidence = 0.1;
    if (kind === "jump") bad.balls[0].x = 0.9;
    assert.equal(c.update(bad).status, kind);
    c.update(frame(300, 0.3));
    assert.equal(c.reps, 0);
  }
});
test("long observation gaps and reversed timestamps cannot complete a stale cycle", () => {
  const c = new DribbleCounter();
  c.update(frame(0, 0.3));
  c.update(frame(100, 0.5));
  c.update(frame(200, 0.7));
  assert.equal(c.update(frame(150, 0.3)).status, "stale");
  c.update(frame(600, 0.3));
  assert.equal(c.reps, 0);
});
test("targets score only complete cycles on requested screen side, then alternate", () => {
  const s = new DribbleSession("targets", "ball");
  s.start(0);
  cycle(s, 0, 0.75);
  assert.equal(s.result.targetHits, 0);
  cycle(s, 650, 0.25);
  cycle(s, 1300, 0.25);
  assert.equal(s.result.targetHits, 1);
  assert.equal(s.target, "right");
  cycle(s, 1950, 0.75);
  cycle(s, 2600, 0.75);
  assert.equal(s.result.targetHits, 2);
  assert.equal(s.target, "left");
});
test("pause excludes waiting time and requires a fresh cycle after resuming", () => {
  const s = new DribbleSession("count", "ball");
  s.start(0);
  s.accept(frame(0, 0.3), 0);
  s.accept(frame(100, 0.5), 100);
  s.pause(150);
  s.tick(10000);
  assert.equal(s.elapsedMs, 150);
  s.resume(10000);
  s.accept(frame(10050, 0.3), 10050);
  assert.equal(s.result.reps, 0);
  assert.equal(s.elapsedMs, 200);
});
test("deadline and finished sessions ignore further input", () => {
  const s = new DribbleSession("count", "simulation");
  s.start(0);
  s.tick(30000);
  const result = s.result;
  s.accept(frame(30100, 0.3), 30100);
  assert.equal(s.phase, "finished");
  assert.deepEqual(s.result, result);
  assert.equal(result.durationMs, 30000);
});
test("future and delayed observations are ignored; invalid clocks do not poison results", () => {
  const s = new DribbleSession("count", "ball");
  assert.throws(() => s.start(NaN));
  s.start(0);
  s.accept(frame(1000, 0.5), 100);
  assert.equal(s.ball, null);
  s.accept(frame(0, 0.5), 500);
  assert.equal(s.ball, null);
  s.finish(NaN);
  assert.equal(s.phase, "running");
  s.pause(600);
  s.resume(500);
  assert.equal(s.phase, "paused");
});
