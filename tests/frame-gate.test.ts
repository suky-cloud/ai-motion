import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameGate } from '../packages/vision-contract/src/frame-gate.ts';

function frame(timestampMs: number) {
  return { timestampMs, releases: 0, dispose() { this.releases++; } };
}

test('30 FPS input limits inference to 10 FPS and releases every frame once', () => {
  const gate = new FrameGate(10);
  const frames = Array.from({ length: 30 }, (_, i) => frame(i * 1000 / 30));
  let calls = 0;
  for (const input of frames) gate.process(input, () => ++calls);
  assert.equal(calls, 10);
  assert.ok(frames.every(input => input.releases === 1));
});

test('inference failure still releases and later frames recover', () => {
  const gate = new FrameGate();
  const input = frame(0);
  assert.throws(() => gate.process(input, () => { throw new Error('model failed'); }));
  assert.equal(input.releases, 1);
  assert.equal(gate.process(frame(100), () => 42), 42);
});

test('pause releases incoming frames without invoking inference; resume works', () => {
  const gate = new FrameGate();
  gate.setActive(false);
  const input = frame(10);
  gate.process(input, () => assert.fail('inference while paused'));
  assert.equal(input.releases, 1);
  gate.setActive(true);
  assert.equal(gate.process(frame(20), () => 'tracked'), 'tracked');
});

test('invalid, duplicate and out-of-order timestamps are rejected and released', () => {
  const gate = new FrameGate();
  gate.process(frame(200), () => true);
  for (const timestamp of [200, 100, NaN, Infinity, -1]) {
    const input = frame(timestamp);
    gate.process(input, () => assert.fail('invalid timestamp accepted'));
    assert.equal(input.releases, 1);
  }
});

test('new camera session can reset the timestamp origin', () => {
  const gate = new FrameGate();
  gate.process(frame(10000), () => true);
  gate.reset();
  assert.equal(gate.process(frame(0), () => 'new session'), 'new session');
});

test('invalid rate is rejected', () => {
  for (const fps of [0, -1, NaN, Infinity]) assert.throws(() => new FrameGate(fps), RangeError);
});

test('async result is rejected and the borrowed frame is released', () => {
  const input = frame(0);
  assert.throws(() => new FrameGate().process(input, () => Promise.resolve(1)), TypeError);
  assert.equal(input.releases, 1);
});
