/** Experimental side-view geometry. Not a validated exercise assessor; requires calibrated, full-body pose input. */
export type Joint = { x: number; y: number; confidence: number };
export type SquatPose = { hip: Joint; knee: Joint; ankle: Joint; timestampMs: number };
export function jointAngle(a: Joint, b: Joint, c: Joint): number | null {
  if (![a, b, c].every(p => [p.x, p.y, p.confidence].every(Number.isFinite) && p.confidence >= 0.6 && p.confidence <= 1)) return null;
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  if (length < 1e-8) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / length))) * 180 / Math.PI;
}
export class SquatCounter {
  private stage: 'standing' | 'down' | 'unknown' = 'unknown';
  private last = -Infinity;
  private downAt = 0;
  reps = 0;
  update(pose: SquatPose) {
    const angle = jointAngle(pose.hip, pose.knee, pose.ankle);
    if (!Number.isFinite(pose.timestampMs) || pose.timestampMs <= this.last) return { reps: this.reps, angle: null, status: 'invalid' as const };
    if (pose.timestampMs - this.last > 500) this.stage = 'unknown';
    this.last = pose.timestampMs;
    if (angle === null) { this.stage = 'unknown'; return { reps: this.reps, angle, status: 'unavailable' as const }; }
    if (angle >= 160) {
      if (this.stage === 'down' && pose.timestampMs - this.downAt >= 300) this.reps++;
      this.stage = 'standing';
    } else if (angle <= 100 && this.stage === 'standing') { this.stage = 'down'; this.downAt = pose.timestampMs; }
    return { reps: this.reps, angle, status: 'observed' as const };
  }
  reset() { this.stage = 'unknown'; this.last = -Infinity; this.downAt = 0; this.reps = 0; }
}
