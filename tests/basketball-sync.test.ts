import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeSample,
  estimateKcal,
  localAdvice,
} from "../packages/training-core/src/index.ts";
const sample = {
  version: 1,
  sessionId: "ball-session",
  seq: 1,
  startedAt: "2026-11-12T00:00:00Z",
  source: "ball",
  activity: "运球实验",
  phase: "finished",
  activeMs: 30000,
  reps: 20,
  tracking: "tracked",
  confidence: 0.9,
  dribble: {
    mode: "targets",
    targetHits: 5,
    longestStreak: 8,
    cadence: 90,
    rhythmVariation: 0.1,
  },
};
test("ball telemetry preserves validated experimental metrics and rejects impossible statistics", () => {
  const decoded = decodeSample(sample);
  assert.deepEqual(decoded.dribble, sample.dribble);
  sample.dribble.targetHits = 6;
  assert.equal(decoded.dribble!.targetHits, 5);
  sample.dribble.targetHits = 5;
  for (const dribble of [
    { ...sample.dribble, targetHits: 21 },
    { ...sample.dribble, cadence: Infinity },
    { ...sample.dribble, longestStreak: -1 },
  ])
    assert.throws(() => decodeSample({ ...sample, dribble }));
  assert.match(localAdvice(decoded)[0], /轨迹计数实验/);
});
test("video inspection is distinguished from live training and cannot estimate exercise energy", () => {
  const decoded = decodeSample({ ...sample, source: "video" });
  assert.match(localAdvice(decoded)[0], /本地视频/);
  assert.equal(estimateKcal(60000, 60, 6, "video"), null);
});
