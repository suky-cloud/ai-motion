/** Local single-ball dribble experiment. No inference, images, UI or transport dependencies. */
/** Align native capture timestamps to JS without baking model warm-up latency into the clock. */
export class NativeClockMapper {
  private offset: number | null = null;
  reset() {
    this.offset = null;
  }
  map(capturedMs: number, receivedMs: number): number {
    if (
      !Number.isFinite(capturedMs) ||
      capturedMs < 0 ||
      !Number.isFinite(receivedMs) ||
      receivedMs < 0
    )
      throw new Error("识别时钟无效");
    const candidate = receivedMs - capturedMs;
    this.offset =
      this.offset === null ? candidate : Math.min(this.offset, candidate);
    return capturedMs + this.offset;
  }
}
export type Ball = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};
export type BallFrame = {
  timestampMs: number;
  width: number;
  height: number;
  mirrored: boolean;
  balls: Ball[];
  inferenceMs: number;
};
export type DribbleStatus = "tracking" | "lost" | "multiple" | "jump" | "stale";
export function decodeBallFrame(raw: unknown): BallFrame {
  const x = raw as BallFrame;
  if (
    !x ||
    !Number.isFinite(x.timestampMs) ||
    x.timestampMs < 0 ||
    !Number.isFinite(x.inferenceMs) ||
    x.inferenceMs < 0 ||
    !Number.isInteger(x.width) ||
    x.width <= 0 ||
    !Number.isInteger(x.height) ||
    x.height <= 0 ||
    typeof x.mirrored !== "boolean" ||
    !Array.isArray(x.balls) ||
    x.balls.length > 20
  )
    throw new Error("球体识别数据无效");
  const balls = x.balls.map((b) => {
    if (
      !b ||
      ![b.x, b.y, b.width, b.height, b.confidence].every(Number.isFinite) ||
      b.x < 0 ||
      b.x > 1 ||
      b.y < 0 ||
      b.y > 1 ||
      b.width <= 0 ||
      b.width > 1 ||
      b.height <= 0 ||
      b.height > 1 ||
      b.confidence < 0 ||
      b.confidence > 1
    )
      throw new Error("球体框无效");
    return {
      x: x.mirrored ? 1 - b.x : b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      confidence: b.confidence,
    };
  });
  return {
    timestampMs: x.timestampMs,
    width: x.width,
    height: x.height,
    mirrored: false,
    balls,
    inferenceMs: x.inferenceMs,
  };
}
export type Bounce = {
  timestampMs: number;
  x: number;
  periodMs: number | null;
};
export class DribbleCounter {
  private last: { ball: Ball; time: number } | null = null;
  private stage: "seeking" | "descending" | "returning" = "seeking";
  private highY = 0;
  private lowY = 0;
  private bottomX = 0;
  private started = 0;
  private lastBounce = -Infinity;
  reps = 0;
  breakCycle() {
    this.last = null;
    this.stage = "seeking";
    this.lastBounce = -Infinity;
  }
  update(frame: BallFrame): {
    status: DribbleStatus;
    ball: Ball | null;
    bounce: Bounce | null;
  } {
    if (this.last && frame.timestampMs <= this.last.time)
      return { status: "stale", ball: null, bounce: null };
    const candidates = frame.balls.filter((b) => b.confidence >= 0.45);
    if (candidates.length !== 1) {
      this.breakCycle();
      return {
        status: candidates.length > 1 ? "multiple" : "lost",
        ball: null,
        bounce: null,
      };
    }
    const ball = candidates[0];
    const previous = this.last;
    if (previous && frame.timestampMs - previous.time > 250) this.breakCycle();
    if (
      this.last &&
      previous &&
      (Math.hypot(ball.x - previous.ball.x, ball.y - previous.ball.y) > 0.35 ||
        Math.max(
          ball.width / previous.ball.width,
          previous.ball.width / ball.width,
        ) > 2.5)
    ) {
      this.breakCycle();
      return { status: "jump", ball: null, bounce: null };
    }
    const amplitude = Math.max(0.06, Math.min(0.16, ball.height * 1.2));
    const turn = Math.max(0.018, Math.min(0.04, ball.height * 0.35));
    let bounce: Bounce | null = null;
    if (!this.last) {
      this.highY = ball.y;
      this.lowY = ball.y;
      this.started = frame.timestampMs;
    } else if (this.stage === "seeking") {
      if (ball.y < this.highY) {
        this.highY = ball.y;
        this.started = frame.timestampMs;
      }
      if (ball.y - this.highY >= amplitude) {
        this.stage = "descending";
        this.lowY = ball.y;
        this.bottomX = ball.x;
      }
    } else if (this.stage === "descending") {
      if (ball.y >= this.lowY) {
        this.lowY = ball.y;
        this.bottomX = ball.x;
      } else if (this.lowY - ball.y >= turn) this.stage = "returning";
    } else if (
      ball.y <= this.lowY - amplitude &&
      frame.timestampMs - this.started >= 180 &&
      frame.timestampMs - this.started <= 1800 &&
      frame.timestampMs - this.lastBounce >= 220
    ) {
      bounce = {
        timestampMs: frame.timestampMs,
        x: this.bottomX,
        periodMs: Number.isFinite(this.lastBounce)
          ? frame.timestampMs - this.lastBounce
          : null,
      };
      this.reps++;
      this.lastBounce = frame.timestampMs;
      this.stage = "seeking";
      this.highY = ball.y;
      this.started = frame.timestampMs;
    } else if (ball.y > this.lowY - turn) {
      this.stage = "descending";
    }
    if (frame.timestampMs - this.started > 1800) {
      this.stage = "seeking";
      this.highY = ball.y;
      this.started = frame.timestampMs;
    }
    this.last = { ball, time: frame.timestampMs };
    return { status: "tracking", ball, bounce };
  }
}
export type DribbleMode = "count" | "targets";
export type DribbleResult = {
  reps: number;
  targetHits: number;
  longestStreak: number;
  cadence: number | null;
  rhythmVariation: number | null;
  durationMs: number;
  source: "ball" | "simulation" | "video";
};
export class DribbleSession {
  private counter = new DribbleCounter();
  private lastTick = 0;
  private inputTime = -Infinity;
  private streak = 0;
  private periods: number[] = [];
  phase: "idle" | "running" | "paused" | "finished" = "idle";
  elapsedMs = 0;
  target: "left" | "right" = "left";
  targetHits = 0;
  longestStreak = 0;
  status: DribbleStatus = "lost";
  ball: Ball | null = null;
  readonly mode: DribbleMode;
  readonly source: DribbleResult["source"];
  constructor(mode: DribbleMode, source: DribbleResult["source"]) {
    this.mode = mode;
    this.source = source;
  }
  start(now: number) {
    if (this.phase !== "idle") throw new Error("请创建新一轮");
    if (!Number.isFinite(now) || now < 0) throw new Error("训练时钟无效");
    this.lastTick = now;
    this.phase = "running";
  }
  tick(now: number) {
    if (
      this.phase !== "running" ||
      !Number.isFinite(now) ||
      now < this.lastTick
    )
      return;
    this.elapsedMs = Math.min(30000, this.elapsedMs + now - this.lastTick);
    this.lastTick = now;
    if (now - this.inputTime > 250) {
      this.ball = null;
      this.status = "stale";
      this.counter.breakCycle();
      this.streak = 0;
    }
    if (this.elapsedMs >= 30000) this.finish(now);
  }
  accept(raw: unknown, now: number) {
    this.tick(now);
    if (this.phase !== "running") return;
    const frame = decodeBallFrame(raw);
    if (
      frame.timestampMs <= this.inputTime ||
      frame.timestampMs > now ||
      now - frame.timestampMs > 250
    )
      return;
    this.inputTime = frame.timestampMs;
    const result = this.counter.update(frame);
    this.status = result.status;
    this.ball = result.ball;
    if (result.status !== "tracking") this.streak = 0;
    if (result.bounce) {
      this.streak++;
      this.longestStreak = Math.max(this.longestStreak, this.streak);
      if (result.bounce.periodMs !== null)
        this.periods.push(result.bounce.periodMs);
      if (
        this.mode === "targets" &&
        (this.target === "left"
          ? result.bounce.x < 0.42
          : result.bounce.x > 0.58)
      ) {
        this.targetHits++;
        this.target = this.target === "left" ? "right" : "left";
      }
    }
  }
  pause(now: number) {
    this.tick(now);
    if (this.phase === "running") this.phase = "paused";
    this.clearInput();
  }
  resume(now: number) {
    if (
      this.phase === "paused" &&
      Number.isFinite(now) &&
      now >= this.lastTick
    ) {
      this.lastTick = now;
      this.phase = "running";
      this.clearInput();
    }
  }
  finish(now: number) {
    if (!Number.isFinite(now) || now < this.lastTick) return;
    if (this.phase === "running") {
      const delta = now - this.lastTick;
      this.elapsedMs = Math.min(30000, this.elapsedMs + delta);
      this.lastTick = now;
    }
    if (this.phase !== "idle") this.phase = "finished";
    this.clearInput();
  }
  private clearInput() {
    this.ball = null;
    this.counter.breakCycle();
    this.inputTime = -Infinity;
    this.streak = 0;
  }
  get result(): DribbleResult {
    const mean = this.periods.length
      ? this.periods.reduce((a, b) => a + b, 0) / this.periods.length
      : null;
    return {
      reps: this.counter.reps,
      targetHits: this.targetHits,
      longestStreak: this.longestStreak,
      cadence: mean ? 60000 / mean : null,
      rhythmVariation:
        mean && this.periods.length >= 3
          ? Math.sqrt(
              this.periods.reduce((n, p) => n + (p - mean) ** 2, 0) /
                this.periods.length,
            ) / mean
          : null,
      durationMs: this.elapsedMs,
      source: this.source,
    };
  }
}
