export type Point = { x: number; y: number };
export type Landmark = Point & { z?: number; visibility?: number; presence?: number };
export type PoseFrame = {
  timestampMs: number;
  landmarks: readonly Landmark[];
  isTracked: boolean;
};
export type MotionInput = Point & {
  timestampMs: number;
  confidence: number;
  isValid: boolean;
  source: 'pose' | 'simulation';
};
export type PreviewTransform = {
  sourceWidth: number;
  sourceHeight: number;
  viewWidth: number;
  viewHeight: number;
  rotation: 0 | 90 | 180 | 270;
  mirrored: boolean;
  resizeMode: 'cover' | 'contain';
};
export const TORSO = [11, 12, 23, 24] as const;
export const FULL_BODY = [11, 12, 23, 24, 25, 26, 27, 28] as const;
export const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
] as const;

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function landmarkConfidence(point: Landmark | undefined): number {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return 0;
  // Missing confidence is unknown, rather than an implicit high-confidence detection.
  const values = [point.visibility, point.presence].filter((v): v is number => v !== undefined);
  if (values.length === 0 || values.some(v => !Number.isFinite(v) || v < 0 || v > 1)) return 0;
  return Math.min(...values);
}

export function torsoCenter(landmarks: readonly Landmark[], threshold = 0.5):
  (Point & { confidence: number; degraded: boolean }) | null {
  const usable = TORSO.filter(index => landmarkConfidence(landmarks[index]) >= threshold);
  // Three points may degrade gracefully, but both shoulder and hip groups must remain present.
  if (usable.length < 3 || !usable.some(index => index <= 12) || !usable.some(index => index >= 23)) return null;
  const points = usable.map(index => landmarks[index]);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    confidence: Math.min(...points.map(landmarkConfidence)),
    degraded: usable.length !== 4,
  };
}

/** Rotation clockwise, then preview mirror, then center crop/letterbox. Returns view-normalized coordinates. */
export function mapToPreview(point: Point, transform: PreviewTransform): Point {
  const { sourceWidth: sw, sourceHeight: sh, viewWidth: vw, viewHeight: vh, rotation } = transform;
  if (![sw, sh, vw, vh].every(value => Number.isFinite(value) && value > 0) ||
      ![point.x, point.y].every(Number.isFinite)) throw new RangeError('Invalid coordinates or dimensions');
  let rotated: Point;
  switch (rotation) {
    case 0: rotated = { ...point }; break;
    case 90: rotated = { x: 1 - point.y, y: point.x }; break;
    case 180: rotated = { x: 1 - point.x, y: 1 - point.y }; break;
    case 270: rotated = { x: point.y, y: 1 - point.x }; break;
    default: throw new RangeError('Unsupported rotation');
  }
  if (transform.mirrored) rotated.x = 1 - rotated.x;
  const width = rotation === 90 || rotation === 270 ? sh : sw;
  const height = rotation === 90 || rotation === 270 ? sw : sh;
  const scale = transform.resizeMode === 'cover' ? Math.max(vw / width, vh / height) : Math.min(vw / width, vh / height);
  return {
    x: (rotated.x * width * scale + (vw - width * scale) / 2) / vw,
    y: (rotated.y * height * scale + (vh - height * scale) / 2) / vh,
  };
}

/** Frame-rate-independent exponential smoothing; callers reset this after tracking loss. */
export function smoothPoint(previous: Point | null, next: Point, deltaMs: number, timeConstantMs = 80): Point {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || !Number.isFinite(timeConstantMs) || timeConstantMs <= 0) {
    throw new RangeError('Invalid smoothing timing');
  }
  if (!previous) return { ...next };
  const alpha = 1 - Math.exp(-deltaMs / timeConstantMs);
  return { x: previous.x + (next.x - previous.x) * alpha, y: previous.y + (next.y - previous.y) * alpha };
}

export type TrackingStatus = 'tracked' | 'partial-body' | 'lost' | 'stale';
export class BodyController {
  private previous: Point | null = null;
  private lastTimestamp = -Infinity;

  reset(): void { this.previous = null; this.lastTimestamp = -Infinity; }

  update(frame: PoseFrame, nowMs: number, transform: PreviewTransform,
    source: MotionInput['source'] = 'pose'): { input: MotionInput; status: TrackingStatus } {
    const invalid = (status: TrackingStatus) => {
      this.previous = null;
      return { status, input: { x: 0.5, y: 0.5, confidence: 0, isValid: false, timestampMs: frame.timestampMs, source } };
    };
    if (!Number.isFinite(nowMs) || !Number.isFinite(frame.timestampMs) || frame.timestampMs < 0 ||
        frame.timestampMs > nowMs || nowMs - frame.timestampMs > 250 || frame.timestampMs <= this.lastTimestamp) return invalid('stale');
    const delta = frame.timestampMs - this.lastTimestamp;
    this.lastTimestamp = frame.timestampMs;
    const center = frame.isTracked ? torsoCenter(frame.landmarks) : null;
    if (!center) return invalid('lost');
    if (!FULL_BODY.every(index => landmarkConfidence(frame.landmarks[index]) >= 0.5)) return invalid('partial-body');
    const mapped = mapToPreview(center, transform);
    if (mapped.x < 0 || mapped.x > 1 || mapped.y < 0 || mapped.y > 1) return invalid('partial-body');
    const next = { x: clamp(mapped.x, 0.06, 0.94), y: clamp(mapped.y, 0.06, 0.94) };
    const withinDeadband = this.previous && Math.hypot(next.x - this.previous.x, next.y - this.previous.y) < 0.003;
    const smoothed = withinDeadband ? { ...this.previous! } : smoothPoint(this.previous, next, Number.isFinite(delta) ? delta : 0);
    this.previous = smoothed;
    return { status: 'tracked', input: { ...smoothed, confidence: center.confidence, isValid: true, timestampMs: frame.timestampMs, source } };
  }
}
