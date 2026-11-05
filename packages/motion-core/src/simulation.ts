import { clamp } from './index.ts';
import type { Landmark, Point, PoseFrame } from './index.ts';

/** Synthetic fixtures only. Never present these as camera/model output. */
export function simulatedPose(point: Point, timestampMs: number,
  mode: 'tracked' | 'lost' | 'partial' = 'tracked'): PoseFrame {
  if (mode === 'lost') return { timestampMs, isTracked: false, landmarks: [] };
  const x = clamp(point.x, 0.12, 0.88);
  const y = clamp(point.y, 0.2, 0.65);
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (index: number, px: number, py: number) => {
    landmarks[index] = { x: clamp(px), y: clamp(py), visibility: mode === 'partial' && index >= 25 ? 0 : 0.95 };
  };
  for (const [left, right, dx, dy] of [[11, 12, 0.06, -0.08], [13, 14, 0.1, 0], [15, 16, 0.12, 0.08],
    [23, 24, 0.06, 0.08], [25, 26, 0.07, 0.19], [27, 28, 0.08, 0.3]]) {
    set(left, x - dx, y + dy);
    set(right, x + dx, y + dy);
  }
  return { timestampMs, isTracked: true, landmarks };
}
