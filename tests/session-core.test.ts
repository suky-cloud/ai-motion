import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MotionSession } from '../packages/session-core/src/session.ts';
import { decodePosePayload, LatestPoseSource, SimulationPoseSource } from '../packages/session-core/src/sources.ts';
import type { PoseSource } from '../packages/session-core/src/sources.ts';
import { simulatedPose } from '../packages/motion-core/src/simulation.ts';

const payload = (timestampMs: number, x = 0.3) => ({ ...simulatedPose({ x, y: 0.5 }, timestampMs),
  sourceWidth: 300, sourceHeight: 330, rotation: 0, mirrored: false });

test('native payload validation checks geometry, 33-point shape and finite fields', () => {
  const value = payload(0);
  assert.ok(decodePosePayload(value));
  for (const invalid of [null, {}, { ...value, sourceWidth: 0 }, { ...value, rotation: 45 },
    { ...value, timestampMs: NaN }, { ...value, mirrored: 'yes' }, { ...value, landmarks: [] }]) {
    assert.equal(decodePosePayload(invalid), null);
  }
  value.landmarks[11].x = NaN;
  assert.equal(decodePosePayload(value), null);
  assert.ok(decodePosePayload({ ...payload(10), isTracked: false, landmarks: [] }));
});

test('native inbox copies payloads, consumes only the latest frame and rejects replay', () => {
  const source = new LatestPoseSource();
  source.start();
  const token = source.token;
  const first = payload(10);
  assert.equal(source.push(first, token), true);
  first.landmarks[11].x = 0.99;
  const read = source.read();
  assert.equal(read?.kind, 'sample');
  if (read?.kind === 'sample') assert.notEqual(read.sample.frame.landmarks[11].x, 0.99);
  assert.equal(source.read(), null);
  source.push(payload(20), token);
  source.push(payload(30), token);
  assert.equal(source.push(payload(25), token), false);
  const latest = source.read();
  assert.equal(latest?.kind === 'sample' && latest.sample.frame.timestampMs, 30);
});

test('stopped/restarted/disposed inbox rejects events from an old camera session', () => {
  const source = new LatestPoseSource();
  source.start();
  const old = source.token;
  source.stop();
  assert.equal(source.push(payload(10), old), false);
  source.start();
  assert.equal(source.push(payload(20), old), false);
  assert.equal(source.push(payload(0), source.token), true);
  source.dispose();
  assert.equal(source.read(), null);
  assert.throws(() => source.start());
});

test('session reuses a detector sample between UI ticks but clears it at expiry', () => {
  const source = new LatestPoseSource();
  const session = new MotionSession(source, () => 0.5);
  session.start(0);
  source.push(payload(10), source.token);
  assert.equal(session.tick(10).tracking, 'tracked');
  assert.equal(session.tick(60).tracking, 'tracked');
  assert.ok(session.snapshot.game.cursor);
  const expired = session.tick(261);
  assert.equal(expired.tracking, 'stale'); assert.equal(expired.game.cursor, null); assert.equal(expired.pose, null);
});

test('invalid native payload pauses safely and retry uses a fresh generation', () => {
  const source = new LatestPoseSource();
  const session = new MotionSession(source);
  session.start(0);
  const token = source.token;
  source.push({}, token);
  const failed = session.tick(100);
  assert.equal(failed.issue, 'invalid-payload'); assert.equal(failed.game.phase, 'paused');
  assert.equal(failed.game.cursor, null);
  session.resume(5000);
  assert.equal(source.push(payload(5000), token), false);
  source.push(payload(5010), source.token);
  const recovered = session.tick(5010);
  assert.equal(recovered.issue, null); assert.equal(recovered.tracking, 'tracked');
  assert.equal(recovered.game.elapsedMs, 110);
});

test('ordinary tracking loss stops control without pausing the game clock', () => {
  const source = new SimulationPoseSource();
  const session = new MotionSession(source);
  session.start(0); session.tick(0);
  source.setMode('lost');
  const lost = session.tick(100);
  assert.equal(lost.tracking, 'lost'); assert.equal(lost.game.phase, 'running'); assert.equal(lost.game.cursor, null);
  source.setMode('partial');
  assert.equal(session.tick(200).tracking, 'partial-body');
  source.setMode('tracked');
  assert.equal(session.tick(300).tracking, 'tracked');
});

test('pause/resume clears cached input and does not count background time', () => {
  const source = new SimulationPoseSource();
  const session = new MotionSession(source);
  session.start(0); session.tick(100);
  session.pause(200);
  assert.equal(source.read(1000, { width: 300, height: 330 }), null);
  assert.equal(session.tick(5000).game.elapsedMs, 200);
  const resumed = session.resume(6000);
  assert.equal(resumed.game.cursor, null);
  assert.equal(session.tick(6100).game.elapsedMs, 300);
});

test('changing viewport clears old coordinates and invalid dimensions are rejected', () => {
  const source = new LatestPoseSource();
  const session = new MotionSession(source);
  session.start(0); source.push(payload(10), source.token); session.tick(10);
  session.setViewport({ width: 600, height: 330 });
  assert.equal(session.snapshot.game.cursor, null);
  assert.equal(session.snapshot.pose, null);
  assert.throws(() => session.setViewport({ width: 0, height: 100 }), RangeError);
});

test('complete simulated session produces a result and stops its source at timeout', () => {
  const source = new SimulationPoseSource();
  const session = new MotionSession(source, () => 0.5);
  session.start(0);
  for (let time = 0; time <= 30_000; time += 50) {
    source.setPoint(session.snapshot.game.target ?? { x: 0.5, y: 0.5 });
    session.tick(time);
  }
  const result = session.snapshot.result!;
  assert.ok(result.hits > 10); assert.equal(result.source, 'simulation'); assert.equal(result.durationMs, 30_000);
  assert.equal(source.read(30_050, { width: 300, height: 330 }), null);
  assert.equal(session.tick(40_000).result, result);
  session.start(50_000);
  assert.equal(session.snapshot.result, null); assert.equal(session.snapshot.game.score, 0);
});

test('manual completion captures the final result before releasing transient input', () => {
  const session = new MotionSession(new SimulationPoseSource(), () => 0.5);
  session.start(0); session.tick(0);
  const snapshot = session.finish(100);
  assert.equal(snapshot.result!.score, 10); assert.equal(snapshot.result!.durationMs, 100);
  assert.equal(snapshot.pose, null); assert.equal(snapshot.game.cursor, null);
});

test('source startup and read exceptions pause instead of silently substituting simulation', () => {
  const failing: PoseSource = { kind: 'pose', start() { throw new Error('not available'); }, read() { return null; }, stop() {}, dispose() {} };
  const failed = new MotionSession(failing).start(0);
  assert.equal(failed.game.source, 'pose'); assert.equal(failed.issue, 'source-failed'); assert.equal(failed.game.phase, 'paused');
  const brokenRead: PoseSource = { ...failing, start() {}, read() { throw new Error('driver failure'); } };
  const session = new MotionSession(brokenRead); session.start(0);
  assert.equal(session.tick(10).issue, 'source-failed');
});

test('dispose is idempotent and prevents both more reads and reuse', () => {
  let reads = 0, disposals = 0;
  const source: PoseSource = { kind: 'pose', start() {}, read() { reads++; return null; }, stop() {}, dispose() { disposals++; } };
  const session = new MotionSession(source); session.start(0);
  session.dispose(); session.dispose(); session.tick(100);
  assert.equal(reads, 0); assert.equal(disposals, 1);
  assert.throws(() => session.start(100));
});

test('a source release failure is visible and prevents a second start', () => {
  let starts = 0;
  const source: PoseSource = { kind: 'pose', start() { starts++; }, read() { return null; },
    stop() { throw new Error('release failed'); }, dispose() {} };
  const session = new MotionSession(source);
  assert.equal(session.start(0).issue, 'source-failed');
  assert.equal(starts, 0);
});

test('a future-clock native event cannot leave a stale skeleton or poison the next session', () => {
  const source = new LatestPoseSource();
  const session = new MotionSession(source);
  session.start(0); source.push(payload(10000), source.token);
  const failed = session.tick(100);
  assert.equal(failed.issue, 'invalid-payload'); assert.equal(failed.pose, null);
  assert.equal(failed.game.phase, 'paused');
  session.resume(200); source.push(payload(210), source.token);
  assert.equal(session.tick(210).tracking, 'tracked');
});
