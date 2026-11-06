import { DatabaseSync } from "node:sqlite";
import {
  canAdvance,
  decodePlan,
  decodeSample,
  estimateKcal,
} from "../../../../packages/training-core/src/index.ts";
import type {
  TrainingPlan,
  TrainingRecord,
  TrainingSample,
} from "../../../../packages/training-core/src/index.ts";

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, text TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return row ? (JSON.parse(row.value as string) as T) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO settings VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  plans(): TrainingPlan[] {
    return this.db
      .prepare("SELECT data FROM plans ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.data as string));
  }
  savePlan(raw: unknown) {
    const plan = decodePlan(raw);
    this.db
      .prepare("INSERT OR REPLACE INTO plans VALUES (?,?)")
      .run(plan.id, JSON.stringify(plan));
    return plan;
  }
  removePlan(id: string) {
    this.db.prepare("DELETE FROM plans WHERE id=?").run(id);
  }
  analyses(): Record<string, string> {
    return Object.fromEntries(
      this.db
        .prepare("SELECT id,text FROM analyses")
        .all()
        .map((row) => [row.id, row.text]),
    );
  }
  saveAnalysis(id: string, text: string) {
    if (
      typeof id !== "string" ||
      typeof text !== "string" ||
      text.length > 12000
    )
      throw new Error("分析内容格式不正确");
    this.db
      .prepare("INSERT OR REPLACE INTO analyses VALUES (?,?)")
      .run(id, text);
  }
  records(): TrainingRecord[] {
    return this.db
      .prepare("SELECT data FROM sessions ORDER BY rowid DESC")
      .all()
      .map((row) => JSON.parse(row.data as string));
  }
  ingest(
    raw: unknown,
    owner: string,
    now = new Date().toISOString(),
  ): { accepted: boolean; record: TrainingRecord } {
    const sample = decodeSample(raw);
    const previous = this.db
      .prepare("SELECT owner,data FROM sessions WHERE id=?")
      .get(sample.sessionId);
    if (previous) {
      if (previous.owner !== owner) throw new Error("训练记录属于其他设备");
      const record: TrainingRecord = JSON.parse(previous.data as string);
      if (record.phase === "finished" && sample.seq > record.seq) {
        if (
          sample.phase !== "finished" ||
          sample.source !== record.source ||
          sample.activity !== record.activity ||
          sample.startedAt !== record.startedAt ||
          sample.activeMs !== record.activeMs ||
          sample.reps !== record.reps
        )
          throw new Error("已结束的训练不能重新打开或改写");
        const final = { ...record, seq: sample.seq };
        this.db
          .prepare("UPDATE sessions SET data=? WHERE id=?")
          .run(JSON.stringify(final), sample.sessionId);
        return { accepted: false, record: final };
      }
      if (!canAdvance(record, sample)) {
        if (sample.seq > record.seq && record.phase !== "finished")
          throw new Error("训练数据不符合会话顺序");
        return { accepted: false, record };
      }
    }
    // Motion Catch is a game, not a measured exercise intensity. No MET assigned automatically.
    const record: TrainingRecord = {
      ...sample,
      receivedAt: now,
      estimatedKcal: estimateKcal(sample.activeMs, null, null, sample.source),
    };
    this.db
      .prepare("INSERT OR REPLACE INTO sessions VALUES (?,?,?)")
      .run(sample.sessionId, owner, JSON.stringify(record));
    return { accepted: true, record };
  }
  backup() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      plans: this.plans(),
      records: this.records(),
      analyses: this.analyses(),
      weightKg: this.get("weightKg", null),
    };
  }
  restore(raw: unknown) {
    const data = raw as Record<string, unknown>;
    if (
      !data ||
      data.version !== 1 ||
      !Array.isArray(data.plans) ||
      !Array.isArray(data.records) ||
      data.plans.length > 1000 ||
      data.records.length > 10000
    )
      throw new Error("备份格式不正确");
    const plans = data.plans.map(decodePlan);
    const records = data.records.map(decodeSample);
    const analyses = data.analyses ?? {};
    if (
      !analyses ||
      typeof analyses !== "object" ||
      Array.isArray(analyses) ||
      Object.keys(analyses).length > 10000 ||
      Object.entries(analyses).some(
        ([id, text]) =>
          !/^[\w-]{1,100}$/.test(id) ||
          typeof text !== "string" ||
          text.length > 12000,
      )
    )
      throw new Error("备份中的分析内容无效");
    const weight = data.weightKg;
    if (
      weight !== null &&
      weight !== undefined &&
      (typeof weight !== "number" ||
        !Number.isFinite(weight) ||
        weight < 20 ||
        weight > 300)
    )
      throw new Error("备份中的体重无效");
    this.db.exec("BEGIN");
    try {
      for (const plan of plans) this.savePlan(plan);
      for (const record of records) {
        // Merge backup history without taking ownership from already paired devices.
        if (
          !this.db
            .prepare("SELECT id FROM sessions WHERE id=?")
            .get(record.sessionId)
        )
          this.ingest(record, "import");
      }
      if (weight !== undefined) this.set("weightKg", weight);
      for (const [id, text] of Object.entries(analyses))
        this.saveAnalysis(id, text as string);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
