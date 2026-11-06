import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  powerMonitor,
  clipboard,
} from "electron";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Store } from "./store.ts";
import { SyncService } from "./sync.ts";
import { requestAdvice, testAI, validateAI } from "./ai.ts";
import type { AIConfig } from "./ai.ts";
import {
  decodePlan,
  planStage,
  localAdvice,
} from "../../../../packages/training-core/src/index.ts";
import type {
  TrainingPlan,
  TrainingSample,
  TrainingRecord,
} from "../../../../packages/training-core/src/index.ts";

app.setName("AI Motion");
let store: Store,
  sync: SyncService,
  window: BrowserWindow | null = null;
let demo: {
  plan: TrainingPlan;
  sample: TrainingSample;
  elapsed: number;
  lastTick: number;
} | null = null;
let demoRecord: TrainingRecord | null = null;
let aiBusy = false;
let encryptionAvailable = false;
const config = () => store.get<AIConfig>("ai", { baseUrl: "", model: "" });
const key = async () => {
  const saved = store.get<string>("aiKey", "");
  if (!saved) return "";
  const decrypted = await safeStorage.decryptStringAsync(
    Buffer.from(saved, "base64"),
  );
  if (decrypted.shouldReEncrypt)
    store.set(
      "aiKey",
      (await safeStorage.encryptStringAsync(decrypted.result)).toString(
        "base64",
      ),
    );
  return decrypted.result;
};
function persistDemo() {
  if (!demo) return;
  demo.sample.seq++;
  demoRecord = store.ingest(demo.sample, "desktop-demo").record;
}
function tickDemo() {
  if (!demo || demo.sample.phase !== "running") return;
  const now = performance.now();
  // Long event-loop or OS suspension pauses instead of inventing training activity.
  const delta = now - demo.lastTick;
  demo.lastTick = now;
  if (delta > 5000) {
    demo.sample.phase = "paused";
    persistDemo();
    return;
  }
  const oldStage = planStage(demo.plan, demo.elapsed);
  demo.elapsed += Math.max(0, delta);
  if (!oldStage.resting && !oldStage.done)
    demo.sample.activeMs += Math.round(Math.min(delta, oldStage.remainingMs));
  const stage = planStage(demo.plan, demo.elapsed);
  // Demonstration counts follow the planned cadence; never represented as detected motion.
  demo.sample.reps = demo.plan.items.reduce((total, item) => {
    const index = demo!.plan.items.indexOf(item);
    const before = demo!.plan.items
      .slice(0, index)
      .reduce(
        (n, prior) =>
          n + prior.sets * (prior.workSeconds + prior.restSeconds) * 1000,
        0,
      );
    const time = Math.max(0, demo!.elapsed - before);
    let reps = 0;
    for (let set = 0; set < item.sets; set++)
      reps += Math.floor(
        Math.min(
          1,
          Math.max(
            0,
            (time - set * (item.workSeconds + item.restSeconds) * 1000) /
              (item.workSeconds * 1000),
          ),
        ) * item.reps,
      );
    return total + reps;
  }, 0);
  if (stage.done) demo.sample.phase = "finished";
  persistDemo();
}
function snapshot() {
  return {
    plans: store.plans(),
    records: store.records(),
    analyses: store.analyses(),
    live:
      demoRecord && demo?.sample.phase !== "finished"
        ? demoRecord
        : (sync.live ?? demoRecord),
    demo: demo
      ? {
          stage: planStage(demo.plan, demo.elapsed),
          phase: demo.sample.phase,
          elapsedMs: demo.elapsed,
        }
      : null,
    sync: sync.status(),
    ai: { ...config(), hasKey: !!store.get("aiKey", ""), encryptionAvailable },
    weightKg: store.get<number | null>("weightKg", null),
    dataPath: app.getPath("userData"),
  };
}
async function action(name: string, payload: any) {
  switch (name) {
    case "snapshot":
      return snapshot();
    case "savePlan":
      return store.savePlan(payload);
    case "removePlan": {
      if (typeof payload !== "string") throw new Error("计划编号无效");
      return store.removePlan(payload);
    }
    case "demo": {
      if (payload.command === "start") {
        if (demo && demo.sample.phase !== "finished")
          throw new Error("请先结束当前模拟训练");
        const plan = decodePlan(payload.plan);
        demo = {
          plan,
          elapsed: 0,
          lastTick: performance.now(),
          sample: {
            version: 1,
            sessionId: randomUUID(),
            seq: 0,
            startedAt: new Date().toISOString(),
            source: "simulation",
            activity: plan.name,
            phase: "running",
            activeMs: 0,
            reps: 0,
            tracking: "tracked",
            confidence: 1,
          },
        };
      } else if (demo && demo.sample.phase !== "finished") {
        tickDemo();
        if (payload.command === "pause") demo.sample.phase = "paused";
        else if (payload.command === "resume") {
          demo.sample.phase = "running";
          demo.lastTick = performance.now();
        } else if (payload.command === "finish") demo.sample.phase = "finished";
        else throw new Error("未知操作");
      }
      persistDemo();
      return;
    }
    case "startSync":
      return sync.start();
    case "stopSync":
      return sync.stop();
    case "copyPairing": {
      const endpoint = sync.status().endpoints.find((e) => e.host === payload);
      if (!endpoint) throw new Error("配对已过期，请重新开启接收");
      await clipboard.writeText(endpoint.uri);
      return;
    }
    case "saveProfile": {
      if (
        payload !== null &&
        (typeof payload !== "number" ||
          !Number.isFinite(payload) ||
          payload < 20 ||
          payload > 300)
      )
        throw new Error("体重范围为 20–300 kg");
      store.set("weightKg", payload);
      return;
    }
    case "saveAI": {
      const validated = validateAI(payload);
      if (typeof payload.apiKey !== "string" || payload.apiKey.length > 4096)
        throw new Error("密钥格式不正确");
      if (payload.apiKey) {
        if (!encryptionAvailable)
          throw new Error("系统加密不可用，不能保存密钥");
        store.set(
          "aiKey",
          (await safeStorage.encryptStringAsync(payload.apiKey)).toString(
            "base64",
          ),
        );
      }
      store.set("ai", validated);
      return;
    }
    case "clearAIKey":
      store.set("aiKey", "");
      return;
    case "testAI": {
      try {
        return await testAI(config(), await key());
      } catch (e) {
        if (e instanceof Error && /接口|请填写/.test(e.message)) throw e;
        throw new Error("接口连接失败，请检查网络与已保存的配置");
      }
    }
    case "askAI": {
      if (aiBusy) throw new Error("分析正在进行，请稍候");
      const record = store.records().find((r) => r.sessionId === payload);
      if (!record) throw new Error("请先选择一条训练记录");
      aiBusy = true;
      try {
        const answer = await requestAdvice(config(), await key(), record);
        store.saveAnalysis(record.sessionId, answer);
        return answer;
      } catch (error) {
        if (error instanceof Error && /接口|请填写/.test(error.message))
          throw error;
        throw new Error("分析未完成，请检查网络与接口配置后重试");
      } finally {
        aiBusy = false;
      }
    }
    case "localAdvice": {
      const record = store.records().find((r) => r.sessionId === payload);
      return record ? localAdvice(record) : [];
    }
    case "export": {
      const result = await dialog.showSaveDialog({
        defaultPath: `AI-Motion-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: "训练备份", extensions: ["json"] }],
      });
      if (!result.canceled && result.filePath)
        writeFileSync(result.filePath, JSON.stringify(store.backup(), null, 2));
      return !result.canceled;
    }
    case "import": {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "训练备份", extensions: ["json"] }],
      });
      if (result.canceled) return false;
      const file = readFileSync(result.filePaths[0]);
      if (file.byteLength > 10000000) throw new Error("备份超过 10 MB");
      store.restore(JSON.parse(file.toString()));
      return true;
    }
    default:
      throw new Error("未知操作");
  }
}
function createWindow() {
  window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#F3F6F8",
    title: "AI Motion · 训练工作台",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.loadFile(join(__dirname, "../dist/index.html"));
}
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    encryptionAvailable = await safeStorage.isAsyncEncryptionAvailable();
    mkdirSync(app.getPath("userData"), { recursive: true });
    store = new Store(join(app.getPath("userData"), "workbench.sqlite"));
    sync = new SyncService(store);
    ipcMain.handle("motion:action", async (event, name, payload) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        return { ok: false, error: "无效窗口" };
      try {
        return { ok: true, value: await action(name, payload) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "操作未完成",
        };
      }
    });
    setInterval(tickDemo, 1000).unref();
    powerMonitor.on("suspend", () => {
      if (demo?.sample.phase === "running") {
        demo.sample.phase = "paused";
        persistDemo();
      }
    });
    createWindow();
  });
  app.on("window-all-closed", () => {
    if (demo && demo.sample.phase === "running") {
      demo.sample.phase = "paused";
      persistDemo();
    }
    void sync?.stop();
    store?.close();
    app.quit();
  });
}
