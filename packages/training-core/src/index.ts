/** Serializable protocol shared by mobile, desktop and offline tests. No hardware or network dependencies. */
export type InputKind = 'simulation' | 'pose';
export type TrainingPhase = 'running' | 'paused' | 'finished';
export type TrainingSample = {
  version: 1; sessionId: string; seq: number; startedAt: string; source: InputKind;
  activity: string; phase: TrainingPhase; activeMs: number; reps: number;
  tracking: 'tracked' | 'lost' | 'partial-body' | 'stale'; confidence: number;
};
export type PlanItem = { id: string; name: string; sets: number; reps: number; workSeconds: number; restSeconds: number };
export type TrainingPlan = { id: string; name: string; date: string; items: PlanItem[] };
export type TrainingRecord = TrainingSample & { receivedAt: string; estimatedKcal: number | null };

const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 100): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max;
const integer = (x: unknown, min: number, max: number): x is number => Number.isSafeInteger(x) && (x as number) >= min && (x as number) <= max;
export function decodeSample(x: unknown): TrainingSample {
  if (!object(x) || x.version !== 1 || !text(x.sessionId) || !/^[\w-]+$/.test(x.sessionId) || !integer(x.seq, 0, 1e9) ||
    !text(x.startedAt) || !Number.isFinite(Date.parse(x.startedAt)) || !['simulation', 'pose'].includes(x.source as string) ||
    !text(x.activity, 80) || !['running', 'paused', 'finished'].includes(x.phase as string) || !integer(x.activeMs, 0, 86400000) ||
    !integer(x.reps, 0, 100000) || !['tracked', 'lost', 'partial-body', 'stale'].includes(x.tracking as string) ||
    typeof x.confidence !== 'number' || !Number.isFinite(x.confidence) || x.confidence < 0 || x.confidence > 1) throw new Error('训练数据格式不正确');
  return { version: 1, sessionId: x.sessionId, seq: x.seq, startedAt: x.startedAt, source: x.source as InputKind,
    activity: x.activity, phase: x.phase as TrainingPhase, activeMs: x.activeMs, reps: x.reps,
    tracking: x.tracking as TrainingSample['tracking'], confidence: x.confidence };
}
export function decodePlan(x: unknown): TrainingPlan {
  if (!object(x) || !text(x.id) || !text(x.name, 60) || !text(x.date) || !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
    new Date(`${x.date}T00:00:00Z`).toISOString().slice(0, 10) !== x.date || !Array.isArray(x.items) || x.items.length < 1 || x.items.length > 30) throw new Error('请填写计划名称、日期和 1–30 个动作');
  const ids = new Set();
  const items = x.items.map(item => {
    if (!object(item) || !text(item.id) || ids.has(item.id) || !text(item.name, 60) || !integer(item.sets, 1, 20) ||
      !integer(item.reps, 0, 200) || !integer(item.workSeconds, 5, 3600) || !integer(item.restSeconds, 0, 600)) throw new Error('动作参数超出范围：组数 1–20，次数 0–200，训练 5–3600 秒，休息 0–600 秒');
    ids.add(item.id);
    return { id: item.id, name: item.name, sets: item.sets, reps: item.reps, workSeconds: item.workSeconds, restSeconds: item.restSeconds };
  });
  return { id: x.id, name: x.name.trim(), date: x.date, items };
}
export function canAdvance(previous: TrainingSample, next: TrainingSample): boolean {
  return next.sessionId === previous.sessionId && next.seq > previous.seq && previous.phase !== 'finished' &&
    next.startedAt === previous.startedAt && next.source === previous.source && next.activity === previous.activity &&
    next.activeMs >= previous.activeMs && next.reps >= previous.reps;
}
/** Gross energy estimate, only for an explicitly chosen activity intensity, never inferred from game hits. */
export function estimateKcal(activeMs: number, weightKg: number | null, met: number | null, source: InputKind): number | null {
  if (source === 'simulation' || weightKg === null || met === null || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 300 ||
    !Number.isFinite(activeMs) || activeMs < 0 || !Number.isFinite(met) || met < 1 || met > 20) return null;
  return Math.round(met * 3.5 * weightKg / 200 * activeMs / 60000 * 10) / 10;
}
export function localAdvice(sample: TrainingSample): string[] {
  if (sample.source === 'simulation') return ['这是模拟数据，可用来检查工作台流程；不能据此评价实际动作或计算消耗。'];
  if (sample.tracking !== 'tracked' || sample.confidence < 0.6) return ['关键点不完整或可信度不足，暂时无法评价动作。请检查全身是否入镜及光线。'];
  return ['已收到训练统计。当前数据不包含关节角度与动作证据，暂时无法判断动作规范。'];
}
export type PlanStage = { item: PlanItem; set: number; resting: boolean; remainingMs: number; done: boolean };
export function planStage(plan: TrainingPlan, activeMs: number): PlanStage {
  let left = Math.max(0, activeMs);
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i];
    for (let set = 1; set <= item.sets; set++) {
      const work = item.workSeconds * 1000;
      if (left < work) return { item, set, resting: false, remainingMs: work - left, done: false };
      left -= work;
      const rest = i === plan.items.length - 1 && set === item.sets ? 0 : item.restSeconds * 1000;
      if (left < rest) return { item, set, resting: true, remainingMs: rest - left, done: false };
      left -= rest;
    }
  }
  const item = plan.items.at(-1)!;
  return { item, set: item.sets, resting: false, remainingMs: 0, done: true };
}
