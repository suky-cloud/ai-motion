/** Synchronous ownership contract; native adapters must normalize timestamps to ms. */
export interface OwnedFrame {
  timestampMs: number;
  dispose(): void;
}

/** No buffering: skipped and failed frames are released by the caller-facing gate. */
export class FrameGate {
  private active = true;
  private lastSeen = -Infinity;
  private lastProcessed = -Infinity;
  private readonly intervalMs: number;

  constructor(fps = 10) {
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('fps must be positive');
    this.intervalMs = 1000 / fps;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  /** Use only after the old camera session has stopped delivering frames. */
  reset(): void {
    this.lastSeen = -Infinity;
    this.lastProcessed = -Infinity;
  }

  process<T>(frame: OwnedFrame, infer: (frame: OwnedFrame) => T): T | undefined {
    try {
      const time = frame.timestampMs;
      if (!this.active || !Number.isFinite(time) || time < 0 || time <= this.lastSeen) return;
      this.lastSeen = time;
      if (time - this.lastProcessed < this.intervalMs) return;
      this.lastProcessed = time;
      const result = infer(frame);
      if (result != null && typeof (result as { then?: unknown }).then === 'function') {
        throw new TypeError('Inference must be synchronous; async ownership needs a separate adapter');
      }
      return result;
    } finally {
      frame.dispose();
    }
  }
}
