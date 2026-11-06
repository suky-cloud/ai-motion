import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { Store } from "../src/main/store.ts";
import { SyncService } from "../src/main/sync.ts";
import { requestAdvice, validateAI, testAI } from "../src/main/ai.ts";
const sample = {
  version: 1,
  sessionId: "phone-session",
  seq: 1,
  startedAt: "2026-11-06T00:00:00Z",
  source: "simulation",
  activity: "Motion Catch",
  phase: "running",
  activeMs: 1000,
  reps: 1,
  tracking: "tracked",
  confidence: 1,
};
test("SQLite persists sessions, deduplicates replay and protects ownership", () => {
  const file = join(mkdtempSync(join(tmpdir(), "motion-db-")), "test.sqlite");
  let db = new Store(file);
  db.ingest(sample, "phone");
  assert.equal(db.ingest(sample, "phone").accepted, false);
  assert.throws(() => db.ingest({ ...sample, seq: 2 }, "other"));
  db.close();
  db = new Store(file);
  assert.equal(db.records().length, 1);
  db.ingest({ ...sample, seq: 2, phase: "finished" }, "phone");
  assert.throws(() => db.ingest({ ...sample, seq: 3 }, "phone"));
  assert.equal(
    db.ingest({ ...sample, seq: 3, phase: "finished" }, "phone").record.seq,
    3,
  );
  assert.equal(db.records()[0].phase, "finished");
  assert.equal(db.records()[0].estimatedKcal, null);
  db.close();
});
test("backup merges atomically and never exports credentials", () => {
  const db = new Store(":memory:");
  db.set("aiKey", "encrypted");
  db.set("weightKg", 60);
  db.ingest(sample, "phone");
  const backup = db.backup();
  assert.ok(!JSON.stringify(backup).includes("encrypted"));
  const other = new Store(":memory:");
  other.restore(backup);
  other.restore(backup);
  assert.equal(other.records().length, 1);
  assert.equal(other.get("weightKg", null), 60);
  assert.throws(() =>
    other.restore({ ...backup, records: [{ ...sample, seq: NaN }] }),
  );
  assert.equal(other.records().length, 1);
  db.close();
  other.close();
});
test("LAN authentication, accepted event, replay and reconnect share one record", async () => {
  const db = new Store(":memory:");
  const sync = new SyncService(db);
  let socket: WebSocket | null = null;
  try {
    const status = await sync.start();
    const uri = new URL(status.endpoints[0].uri);
    const endpoint = new URL(uri.searchParams.get("endpoint")!);
    endpoint.hostname = "127.0.0.1";
    socket = new WebSocket(endpoint);
    await once(socket, "open");
    const ready = once(socket, "message");
    socket.send(
      JSON.stringify({
        type: "auth",
        token: uri.searchParams.get("token"),
        deviceId: "phone-device123",
      }),
    );
    assert.equal(JSON.parse((await ready)[0].toString()).type, "ready");
    for (const event of [
      sample,
      sample,
      { ...sample, seq: 2, phase: "finished" },
    ]) {
      const ack = once(socket, "message");
      socket.send(JSON.stringify({ type: "sample", sample: event }));
      assert.equal(JSON.parse((await ack)[0].toString()).type, "ack");
    }
    assert.equal(db.records().length, 1);
    assert.equal(db.records()[0].phase, "finished");
    socket.close();
    await once(socket, "close");
    socket = new WebSocket(endpoint);
    await once(socket, "open");
    const close = once(socket, "close");
    socket.send(
      JSON.stringify({
        type: "auth",
        token: "wrong",
        deviceId: "phone-device123",
      }),
    );
    await close;
    assert.equal(db.records().length, 1);
  } finally {
    socket?.terminate();
    await sync.stop();
    db.close();
  }
});
test("browser-origin LAN clients are rejected", async () => {
  const db = new Store(":memory:");
  const sync = new SyncService(db);
  try {
    const status = await sync.start();
    const link = new URL(status.endpoints[0].uri);
    const endpoint = new URL(link.searchParams.get("endpoint")!);
    endpoint.hostname = "127.0.0.1";
    const socket = new WebSocket(endpoint, { origin: "https://example.com" });
    const closed = await once(socket, "close");
    assert.equal(closed[0], 1008);
  } finally {
    await sync.stop();
    db.close();
  }
});
test("AI accepts HTTPS and explicit local models, rejects embedded credentials", () => {
  for (const baseUrl of ["https://example.com/v1", "http://127.0.0.1:11434/v1"])
    assert.ok(validateAI({ baseUrl, model: "test" }));
  for (const baseUrl of [
    "http://example.com/v1",
    "https://key@example.com/v1",
    "https://example.com/v1?key=123",
  ])
    assert.throws(() => validateAI({ baseUrl, model: "test" }));
});
test("AI sends only explicit summary and parses compatible reply", async () => {
  let body = "";
  const fetcher = (async (_url: any, options: any) => {
    body = options.body;
    assert.equal(options.redirect, "error");
    return Response.json({
      choices: [{ message: { content: "模拟数据不能评价真人。" } }],
    });
  }) as typeof fetch;
  assert.match(
    await requestAdvice(
      { baseUrl: "https://example.com/v1", model: "test" },
      "secret",
      {
        ...sample,
        image: "private-camera",
        deviceId: "private-device",
        weightKg: 60,
      },
      fetcher,
    ),
    /模拟/,
  );
  for (const secret of [
    "private-camera",
    "private-device",
    "weightKg",
    "sessionId",
    "startedAt",
  ])
    assert.ok(!body.includes(secret));
});
test("AI errors and oversize responses are contained", async () => {
  const config = { baseUrl: "http://127.0.0.1:11434/v1", model: "test" };
  await assert.rejects(
    requestAdvice(
      config,
      "",
      sample,
      (async () => new Response("no", { status: 401 })) as typeof fetch,
    ),
    /401/,
  );
  await assert.rejects(
    requestAdvice(
      config,
      "",
      sample,
      (async () => new Response("x".repeat(70000))) as typeof fetch,
    ),
    /过大/,
  );
  assert.match(
    await testAI(config, "", (async () =>
      Response.json({ data: [] })) as typeof fetch),
    /可访问/,
  );
});
test("saved AI review survives backup merge without carrying the API key", () => {
  const db = new Store(":memory:");
  db.ingest(sample, "phone");
  db.saveAnalysis(sample.sessionId, "仅有统计，无法判断姿态。");
  db.set("aiKey", "private-key");
  const other = new Store(":memory:");
  other.restore(db.backup());
  assert.equal(other.analyses()[sample.sessionId], "仅有统计，无法判断姿态。");
  assert.equal(other.get("aiKey", ""), "");
  db.close();
  other.close();
});
