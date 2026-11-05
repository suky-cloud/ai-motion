import type { MotionInput, Point, PoseFrame, PreviewTransform } from '../../motion-core/src/index.ts';
import { simulatedPose } from '../../motion-core/src/simulation.ts';

export type Viewport = { width: number; height: number };
export type PoseSample = {
  frame: PoseFrame;
  image: Omit<PreviewTransform, 'viewWidth' | 'viewHeight'>;
};
export type SourceIssue = 'invalid-payload' | 'source-failed';
export type SourceEvent = { kind: 'sample'; sample: PoseSample } | { kind: 'error'; issue: SourceIssue };

/** A synchronous mailbox boundary. Hardware/model initialization belongs to the platform adapter. */
export interface PoseSource {
  readonly kind: MotionInput['source'];
  start(): void;
  read(nowMs: number, viewport: Viewport): SourceEvent | null;
  stop(): void;
  dispose(): void;
}

export class SimulationPoseSource implements PoseSource {
  readonly kind = 'simulation' as const;
  private active = false;
  private disposed = false;
  private point: Point = { x: 0.5, y: 0.5 };
  private mode: 'tracked' | 'lost' | 'partial' = 'tracked';

  setPoint(point: Point): void {
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) this.point = { ...point };
  }
  setMode(mode: 'tracked' | 'lost' | 'partial'): void { this.mode = mode; }
  reset(): void { this.point = { x: 0.5, y: 0.5 }; this.mode = 'tracked'; }
  start(): void {
    if (this.disposed) throw new Error('Source is disposed');
    this.active = true;
  }
  read(nowMs: number, viewport: Viewport): SourceEvent | null {
    if (!this.active) return null;
    return { kind: 'sample', sample: {
      frame: simulatedPose(this.point, nowMs, this.mode),
      image: { sourceWidth: viewport.width, sourceHeight: viewport.height, rotation: 0, mirrored: false, resizeMode: 'cover' },
    } };
  }
  stop(): void { this.active = false; }
  dispose(): void { this.stop(); this.disposed = true; }
}

/** App-owned bridge payload, not a claim about a particular SDK's return shape. */
export function decodePosePayload(payload: unknown): PoseSample | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, unknown>;
  if (typeof data.timestampMs !== 'number' || !Number.isFinite(data.timestampMs) || data.timestampMs < 0 ||
      typeof data.isTracked !== 'boolean' || !Array.isArray(data.landmarks) ||
      typeof data.sourceWidth !== 'number' || !Number.isFinite(data.sourceWidth) || data.sourceWidth <= 0 ||
      typeof data.sourceHeight !== 'number' || !Number.isFinite(data.sourceHeight) || data.sourceHeight <= 0 ||
      ![0, 90, 180, 270].includes(data.rotation as number) || typeof data.mirrored !== 'boolean') return null;
  if (data.isTracked && data.landmarks.length !== 33) return null;
  if (!data.isTracked && data.landmarks.length !== 0) return null;
  const landmarks = [];
  for (const value of data.landmarks) {
    if (!value || typeof value !== 'object') return null;
    const point = value as Record<string, unknown>;
    if (typeof point.x !== 'number' || !Number.isFinite(point.x) || typeof point.y !== 'number' || !Number.isFinite(point.y)) return null;
    for (const key of ['z', 'visibility', 'presence']) {
      const field = point[key];
      if (field !== undefined && (typeof field !== 'number' || !Number.isFinite(field) || (key !== 'z' && (field < 0 || field > 1)))) return null;
    }
    landmarks.push({ x: point.x, y: point.y, z: point.z as number | undefined,
      visibility: point.visibility as number | undefined, presence: point.presence as number | undefined });
  }
  return {
    frame: { timestampMs: data.timestampMs, isTracked: data.isTracked, landmarks },
    image: { sourceWidth: data.sourceWidth, sourceHeight: data.sourceHeight,
      rotation: data.rotation as PreviewTransform['rotation'], mirrored: data.mirrored, resizeMode: 'cover' },
  };
}

/** Latest-only native event inbox. No model, camera driver, or frame buffers are created here. */
export class LatestPoseSource implements PoseSource {
  readonly kind = 'pose' as const;
  private active = false;
  private disposed = false;
  private generation = 0;
  private lastTimestamp = -Infinity;
  private pending: SourceEvent | null = null;

  get token(): number { return this.generation; }
  start(): void {
    if (this.disposed) throw new Error('Source is disposed');
    this.generation++;
    this.active = true;
    this.lastTimestamp = -Infinity;
    this.pending = null;
  }
  push(payload: unknown, token: number): boolean {
    if (!this.active || this.disposed || token !== this.generation) return false;
    const sample = decodePosePayload(payload);
    if (!sample) { this.pending = { kind: 'error', issue: 'invalid-payload' }; return false; }
    if (sample.frame.timestampMs <= this.lastTimestamp) return false;
    this.lastTimestamp = sample.frame.timestampMs;
    this.pending = { kind: 'sample', sample };
    return true;
  }
  fail(token: number): void {
    if (this.active && token === this.generation) this.pending = { kind: 'error', issue: 'source-failed' };
  }
  read(): SourceEvent | null {
    const next = this.pending;
    this.pending = null;
    return this.active ? next : null;
  }
  stop(): void { this.active = false; this.generation++; this.pending = null; }
  dispose(): void { this.stop(); this.disposed = true; }
}
