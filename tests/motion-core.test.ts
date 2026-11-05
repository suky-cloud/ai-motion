import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BodyController, landmarkConfidence, mapToPreview, smoothPoint, torsoCenter } from '../packages/motion-core/src/index.ts';
import type { PreviewTransform } from '../packages/motion-core/src/index.ts';
import { simulatedPose } from '../packages/motion-core/src/simulation.ts';

const identity: PreviewTransform = {
  sourceWidth: 100, sourceHeight: 100, viewWidth: 100, viewHeight: 100,
  rotation: 0, mirrored: false, resizeMode: 'cover',
};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('confidence is conservative about missing, non-finite and off-frame landmarks', () => {
  assert.equal(landmarkConfidence(undefined), 0);
  assert.equal(landmarkConfidence({ x: 0.5, y: 0.5 }), 0);
  for (const invalid of [NaN, Infinity, -1, 2]) assert.equal(landmarkConfidence({ x: 0.5, y: 0.5, visibility: invalid }), 0);
  assert.equal(landmarkConfidence({ x: 1.1, y: 0.5, visibility: 1 }), 0);
  assert.equal(landmarkConfidence({ x: 0.5, y: 0.5, visibility: 0.9, presence: 0.6 }), 0.6);
});

test('torso uses shoulders and hips with an explicit three-point degradation', () => {
  const pose = simulatedPose({ x: 0.4, y: 0.5 }, 0);
  near(torsoCenter(pose.landmarks)!.x, 0.4);
  near(torsoCenter(pose.landmarks)!.y, 0.5);
  pose.landmarks[11].visibility = 0;
  assert.equal(torsoCenter(pose.landmarks)!.degraded, true);
  pose.landmarks[12].visibility = 0;
  assert.equal(torsoCenter(pose.landmarks), null);
});

test('all four rotation cases are mapped before preview mirroring', () => {
  const expected = [[0.2, 0.3], [0.7, 0.2], [0.8, 0.7], [0.3, 0.8]];
  ([0, 90, 180, 270] as const).forEach((rotation, index) => {
    const result = mapToPreview({ x: 0.2, y: 0.3 }, { ...identity, rotation });
    near(result.x, expected[index][0]); near(result.y, expected[index][1]);
    const mirrored = mapToPreview({ x: 0.2, y: 0.3 }, { ...identity, rotation, mirrored: true });
    near(mirrored.x, 1 - result.x); near(mirrored.y, result.y);
  });
});

test('cover accounts for horizontal crop and contain for letterbox padding', () => {
  const transform = { ...identity, sourceWidth: 200 };
  near(mapToPreview({ x: 0.25, y: 0.5 }, transform).x, 0);
  near(mapToPreview({ x: 0.75, y: 0.5 }, transform).x, 1);
  near(mapToPreview({ x: 0.5, y: 0 }, { ...transform, resizeMode: 'contain' }).y, 0.25);
  near(mapToPreview({ x: 0.5, y: 0.5 }, { ...transform, rotation: 90 }).y, 0.5);
  assert.throws(() => mapToPreview({ x: 0, y: 0 }, { ...identity, viewHeight: 0 }), RangeError);
});

test('smoothing is continuous and independent of sampling frequency', () => {
  const next = { x: 1, y: 0 };
  const single = smoothPoint({ x: 0, y: 0 }, next, 100);
  const half = smoothPoint({ x: 0, y: 0 }, next, 50);
  near(smoothPoint(half, next, 50).x, single.x);
  assert.ok(single.x > 0 && single.x < 1);
  assert.deepEqual(smoothPoint(null, next, 0), next);
  assert.throws(() => smoothPoint(null, next, -1), RangeError);
});

test('controller requires complete-body confidence and rejects stale/future/replayed frames', () => {
  const controller = new BodyController();
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 0), 0, identity).input.isValid, true);
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 0), 0, identity).status, 'stale');
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 20, 'partial'), 20, identity).status, 'partial-body');
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 30, 'lost'), 30, identity).status, 'lost');
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 40), 400, identity).status, 'stale');
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 500), 400, identity).status, 'stale');
});

test('controller resets smoothing after loss and supports a new camera session', () => {
  const controller = new BodyController();
  controller.update(simulatedPose({ x: 0.2, y: 0.5 }, 100), 100, identity);
  controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 200, 'lost'), 200, identity);
  near(controller.update(simulatedPose({ x: 0.8, y: 0.5 }, 300), 300, identity).input.x, 0.8);
  controller.reset();
  assert.equal(controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 0), 0, identity).status, 'tracked');
});

test('controller handles mirror, cursor boundaries and torso cropped out of the preview', () => {
  const controller = new BodyController();
  near(controller.update(simulatedPose({ x: 0.2, y: 0.5 }, 0), 0, { ...identity, mirrored: true }).input.x, 0.8);
  controller.reset();
  const wide = { ...identity, sourceWidth: 200 };
  const result = controller.update(simulatedPose({ x: 0.12, y: 0.5 }, 10), 10, wide);
  assert.equal(result.status, 'partial-body');
  const edgePose = simulatedPose({ x: 0.5, y: 0.5 }, 20);
  for (const index of [11, 12, 23, 24]) edgePose.landmarks[index].x = 0.01;
  near(controller.update(edgePose, 20, identity).input.x, 0.06);
});

test('controller holds sub-threshold jitter without suppressing a real movement', () => {
  const controller = new BodyController();
  controller.update(simulatedPose({ x: 0.5, y: 0.5 }, 0), 0, identity);
  near(controller.update(simulatedPose({ x: 0.501, y: 0.5 }, 50), 50, identity).input.x, 0.5);
  const moved = controller.update(simulatedPose({ x: 0.7, y: 0.5 }, 100), 100, identity).input.x;
  assert.ok(moved > 0.5 && moved < 0.7);
});
