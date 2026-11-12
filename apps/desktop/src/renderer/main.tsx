import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { localAdvice } from "../../../../packages/training-core/src/index.ts";
import type {
  PlanStage,
  TrainingPlan,
  TrainingRecord,
} from "../../../../packages/training-core/src/index.ts";
import "./style.css";

type Snapshot = {
  plans: TrainingPlan[];
  records: TrainingRecord[];
  analyses: Record<string, string>;
  live: TrainingRecord | null;
  demo: { stage: PlanStage; phase: string; elapsedMs: number } | null;
  sync: {
    enabled: boolean;
    endpoints: { host: string; uri: string }[];
    expiresAt: number;
    peers: { id: string; seen: number; stale: boolean }[];
    error: string | null;
  };
  ai: {
    baseUrl: string;
    model: string;
    hasKey: boolean;
    encryptionAvailable: boolean;
  };
  weightKg: number | null;
  dataPath: string;
};
declare global {
  interface Window {
    motion: {
      call: (
        name: string,
        payload?: unknown,
      ) => Promise<{ ok: boolean; value?: any; error?: string }>;
    };
  }
}
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const duration = (ms: number) =>
  `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const template = (): TrainingPlan => ({
  id: crypto.randomUUID(),
  name: "轻量活动计划",
  date: today(),
  items: [
    {
      id: crypto.randomUUID(),
      name: "原地踏步",
      sets: 1,
      reps: 0,
      workSeconds: 60,
      restSeconds: 15,
    },
    {
      id: crypto.randomUUID(),
      name: "徒手深蹲",
      sets: 2,
      reps: 10,
      workSeconds: 40,
      restSeconds: 20,
    },
    {
      id: crypto.randomUUID(),
      name: "站姿伸展",
      sets: 1,
      reps: 0,
      workSeconds: 60,
      restSeconds: 0,
    },
  ],
});
const nav = [
  { id: "today", label: "今日计划", icon: "▤" },
  { id: "train", label: "正在训练", icon: "▷" },
  { id: "plans", label: "计划编辑", icon: "≡" },
  { id: "history", label: "训练记录", icon: "◷" },
  { id: "coach", label: "教练与分析", icon: "◇" },
  { id: "devices", label: "设备与设置", icon: "⚙" },
];

function sourceLabel(source: TrainingRecord["source"]) {
  return {
    simulation: "模拟训练",
    pose: "人体输入",
    ball: "球体识别实验",
    video: "本地视频检查",
  }[source];
}
function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("today");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TrainingPlan | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [filter, setFilter] = useState("all");
  const [answer, setAnswer] = useState<{ id: string; text: string } | null>(
    null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  async function refresh() {
    const result = await window.motion.call("snapshot");
    if (result.ok) setData(result.value);
    else setNotice(result.error || "读取失败");
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, []);
  async function run(name: string, payload?: unknown, message?: string) {
    setBusy(true);
    try {
      const result = await window.motion.call(name, payload);
      if (!result.ok) throw new Error(result.error);
      await refresh();
      if (message && result.value !== false) setNotice(message);
      return result.value;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作未完成");
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const execute = (name: string, payload?: unknown, message?: string) => {
    void run(name, payload, message).catch(() => {});
  };
  const start = (plan: TrainingPlan) => {
    void run("demo", { command: "start", plan })
      .then(() => setPage("train"))
      .catch(() => {});
  };
  if (!data)
    return (
      <main className="loading">
        <h1>AI Motion</h1>
        <p>{notice || "正在打开本地工作台…"}</p>
      </main>
    );
  const plans = data.plans.filter((p) => p.date === today());
  const record =
    data.records.find((r) => r.sessionId === selected) ?? data.records[0];
  const answerText =
    answer?.id === record?.sessionId
      ? answer?.text
      : record
        ? data.analyses[record.sessionId]
        : "";
  const live = data.live;
  const stale = live
    ? Date.now() - Date.parse(live.receivedAt) > 3500 &&
      live.phase === "running"
    : false;
  const real = data.records.filter(
    (r) =>
      (r.source === "pose" || r.source === "ball") && r.phase === "finished",
  );
  const edit = (plan?: TrainingPlan) => {
    setDraft(structuredClone(plan ?? template()));
    setPage("plans");
  };
  const seeRecord = (id: string) => {
    setSelected(id);
    setPage("history");
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <div>
            AI Motion<small>训练工作台</small>
          </div>
        </div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "nav-item selected" : "nav-item"}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => setPage(n.id)}
            >
              <span aria-hidden="true">{n.icon}</span>
              {n.label}
              {n.id === "train" && live?.phase === "running" && (
                <i className="status-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> 数据保存在这台电脑
          <small>本地工作台 0.4.0</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
          <button className="connection" onClick={() => setPage("devices")}>
            <i
              className={`status-dot ${data.sync.peers.length ? "" : "muted-dot"}`}
            />
            {data.sync.peers.length
              ? `${data.sync.peers.length} 台设备已配对`
              : "手机尚未连接"}
          </button>
        </header>
        {notice && (
          <div role="status" className="notice">
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {page === "today" && (
          <>
            <div className="page-heading">
              <div>
                <h1>把今天的运动安排好。</h1>
                <p>计划、练习和复盘，都留在这里。</p>
              </div>
              <button className="primary" onClick={() => edit()}>
                新建计划
              </button>
            </div>
            <div className="today-grid">
              <section className="plan-sheet">
                <div className="section-head">
                  <h2>今天练什么</h2>
                  <span>{plans.length} 份计划</span>
                </div>
                {!plans.length ? (
                  <div className="empty-plan">
                    <div className="notebook-mark" aria-hidden="true">
                      ✓<br />—<br />—
                    </div>
                    <h3>今天还没有安排</h3>
                    <p>从一份轻量活动模板开始，按自己的节奏调整。</p>
                    <button className="primary" onClick={() => edit()}>
                      编辑第一份计划
                    </button>
                    <small>模板只是起点，不是个性化运动处方。</small>
                  </div>
                ) : (
                  plans.map((plan) => (
                    <div className="daily-plan" key={plan.id}>
                      <div className="section-head">
                        <h3>{plan.name}</h3>
                        <button
                          className="text-button"
                          onClick={() => edit(plan)}
                        >
                          编辑
                        </button>
                      </div>
                      <ol className="exercise-list">
                        {plan.items.map((item) => (
                          <li key={item.id}>
                            <div>
                              <strong>{item.name}</strong>
                              <span>
                                {item.sets} 组
                                {item.reps
                                  ? `，每组 ${item.reps} 次`
                                  : "，按时长练习"}
                              </span>
                            </div>
                            <span>{item.workSeconds} 秒 / 组</span>
                          </li>
                        ))}
                      </ol>
                      <div className="plan-actions">
                        <span>含组间休息，顺序进行</span>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => start(plan)}
                        >
                          模拟运行计划
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>
              <aside className="right-rail">
                <section>
                  <h2>本周进度</h2>
                  <Week records={real} />
                  <div className="week-total">
                    <strong>
                      {
                        real.filter(
                          (r) =>
                            Date.now() - Date.parse(r.startedAt) < 7 * 86400000,
                        ).length
                      }
                    </strong>{" "}
                    次实际训练记录
                  </div>
                  <p className="muted">模拟训练单独保存，不计入实际进度。</p>
                </section>
                <section className="rail-note">
                  <h2>先熟悉工作台</h2>
                  <p>
                    没有连接手机，也可以运行计划，检查计时、休息和训练记录。
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setPage("devices")}
                  >
                    连接手机与配置 AI
                  </button>
                </section>
              </aside>
            </div>
            <section className="recent">
              <div className="section-head">
                <h2>最近的练习</h2>
                <button
                  className="text-button"
                  onClick={() => setPage("history")}
                >
                  查看全部记录
                </button>
              </div>
              {data.records.length ? (
                data.records
                  .slice(0, 3)
                  .map((r) => (
                    <RecordRow
                      key={r.sessionId}
                      record={r}
                      onClick={() => seeRecord(r.sessionId)}
                    />
                  ))
              ) : (
                <p className="muted">完成第一轮后，训练记录会出现在这里。</p>
              )}
            </section>
          </>
        )}
        {page === "train" && (
          <>
            <div className="page-heading">
              <div>
                <h1>正在训练</h1>
                <p>
                  {live
                    ? live.source === "simulation"
                      ? "模拟数据正在运行，不代表实际运动表现。"
                      : "手机负责采集，工作台同步呈现。"
                    : "选择一份计划模拟运行，或在设备设置中连接手机。"}
                </p>
              </div>
              <span className="badge">
                {live?.source === "simulation"
                  ? "模拟训练"
                  : live
                    ? "手机输入"
                    : "等待开始"}
              </span>
            </div>
            {!live ? (
              <Empty
                title="练习场已准备好"
                text="先在今日计划中保存一份计划，再开始模拟。"
                action="前往今日计划"
                onClick={() => setPage("today")}
              />
            ) : (
              <div className="training-grid">
                <section className="training-surface">
                  <div className="section-head">
                    <h2>{live.activity}</h2>
                    <span className={stale ? "warning" : "muted"}>
                      {stale
                        ? "连接中断，显示最后收到的数据"
                        : live.phase === "paused"
                          ? "已暂停"
                          : live.phase === "finished"
                            ? "已结束"
                            : "进行中"}
                    </span>
                  </div>
                  <div className="practice-space">
                    {live.source === "simulation" ? (
                      <>
                        <PoseIllustration moving={live.phase === "running"} />
                        <div className="practice-caption">
                          <span>示意姿态</span>
                          <h3>
                            {data.demo?.stage.done
                              ? "这一轮完成了"
                              : data.demo?.stage.resting
                                ? "休息一下"
                                : (data.demo?.stage.item.name ??
                                  "手机模拟输入")}
                          </h3>
                          {data.demo && !data.demo.stage.done && (
                            <p>
                              第 {data.demo.stage.set} /{" "}
                              {data.demo.stage.item.sets} 组，还有{" "}
                              {Math.ceil(data.demo.stage.remainingMs / 1000)} 秒
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="waiting-pose">
                        <h3>正在接收运动统计</h3>
                        <p>当前同步协议不包含摄像头视频与骨骼画面。</p>
                      </div>
                    )}
                  </div>
                  <div className="metric-strip">
                    <Metric label="训练计时" value={duration(live.activeMs)} />
                    <Metric
                      label={
                        live.source === "simulation"
                          ? "模拟次数 / 命中"
                          : "次数"
                      }
                      value={String(live.reps)}
                    />
                    <Metric
                      label="估算热量"
                      value={
                        live.estimatedKcal === null
                          ? "—"
                          : `${live.estimatedKcal}`
                      }
                      unit="kcal"
                    />
                  </div>
                  {data.demo && data.demo.phase !== "finished" ? (
                    <div className="training-actions">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          execute("demo", {
                            command:
                              data.demo!.phase === "running"
                                ? "pause"
                                : "resume",
                          })
                        }
                      >
                        {data.demo.phase === "running"
                          ? "暂停计时"
                          : "继续训练"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          execute(
                            "demo",
                            { command: "finish" },
                            "模拟记录已保存",
                          )
                        }
                      >
                        结束并保存
                      </button>
                    </div>
                  ) : (
                    <p className="muted">
                      {live.phase === "finished"
                        ? "记录已自动保存在本地，可到训练记录查看。"
                        : "手机训练请在手机上暂停或结束。"}
                    </p>
                  )}
                </section>
                <aside className="right-rail">
                  <section>
                    <h2>此刻的提示</h2>
                    {localAdvice(live).map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                    <p className="muted">
                      {live.source === "simulation"
                        ? "模拟训练不估算热量。"
                        : "没有已确认的运动强度，热量暂不估算。"}
                    </p>
                  </section>
                  <section className="rail-note">
                    <h2>训练状态</h2>
                    <dl>
                      <dt>输入状态</dt>
                      <dd>
                        {
                          {
                            tracked: "完整",
                            lost: "丢失",
                            "partial-body": "部分身体",
                            stale: "已过期",
                          }[live.tracking]
                        }
                      </dd>
                      <dt>最后更新</dt>
                      <dd>
                        {new Date(live.receivedAt).toLocaleTimeString("zh-CN")}
                      </dd>
                    </dl>
                    <button
                      className="text-button"
                      onClick={() => {
                        setSelected(live.sessionId);
                        setPage("coach");
                      }}
                    >
                      查看复盘与 AI 分析
                    </button>
                  </section>
                </aside>
              </div>
            )}
          </>
        )}
        {page === "plans" && (
          <>
            <div className="page-heading">
              <div>
                <h1>计划编辑</h1>
                <p>安排动作顺序、训练时长和组间休息。</p>
              </div>
              <button className="primary" onClick={() => setDraft(template())}>
                新建计划
              </button>
            </div>
            <div className="editor-layout">
              <section className="plan-index">
                {data.plans.map((p) => (
                  <button
                    key={p.id}
                    className={
                      draft?.id === p.id ? "plan-link active" : "plan-link"
                    }
                    onClick={() => setDraft(structuredClone(p))}
                  >
                    <strong>{p.name}</strong>
                    <span>
                      {p.date} · {p.items.length} 个动作
                    </span>
                  </button>
                ))}
                {!data.plans.length && (
                  <p className="muted">还没有保存的计划。</p>
                )}
              </section>
              <section className="editor-sheet">
                {draft ? (
                  <PlanEditor
                    key={draft.id}
                    plan={draft}
                    busy={busy}
                    onChange={setDraft}
                    onSave={() =>
                      execute("savePlan", draft, "计划已保存在本地")
                    }
                    onDelete={() => {
                      if (window.confirm("删除这份计划？训练记录会保留。"))
                        void run("removePlan", draft.id, "计划已删除")
                          .then(() => setDraft(null))
                          .catch(() => {});
                    }}
                    onDuplicate={() =>
                      setDraft({
                        ...structuredClone(draft),
                        id: crypto.randomUUID(),
                        name: `${draft.name} 副本`.slice(0, 60),
                      })
                    }
                  />
                ) : (
                  <Empty
                    title="为下一次练习留个安排"
                    text="选择左侧计划，或新建一份。"
                    action="使用轻量活动模板"
                    onClick={() => setDraft(template())}
                  />
                )}
              </section>
            </div>
          </>
        )}
        {page === "history" && (
          <>
            <div className="page-heading">
              <div>
                <h1>训练记录</h1>
                <p>每一轮只保存一条记录，重连补传自动合并。</p>
              </div>
              <div className="button-group">
                <button
                  onClick={() => execute("export", undefined, "备份已导出")}
                >
                  导出备份
                </button>
                <button
                  onClick={() => execute("import", undefined, "备份已合并")}
                >
                  导入备份
                </button>
              </div>
            </div>
            <div className="filter-bar" role="group" aria-label="记录来源筛选">
              {[
                ["all", "全部"],
                ["actual", "实际输入"],
                ["simulation", "模拟训练"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="history-layout">
              <section>
                {data.records
                  .filter(
                    (r) =>
                      filter === "all" ||
                      (filter === "actual"
                        ? ["pose", "ball"].includes(r.source)
                        : r.source === filter),
                  )
                  .map((r) => (
                    <RecordRow
                      key={r.sessionId}
                      record={r}
                      onClick={() => setSelected(r.sessionId)}
                      selected={record?.sessionId === r.sessionId}
                    />
                  ))}
                {!data.records.some(
                  (r) =>
                    filter === "all" ||
                    (filter === "actual"
                      ? ["pose", "ball"].includes(r.source)
                      : r.source === filter),
                ) && (
                  <p className="empty-copy">
                    这里还没有记录。可以先运行一次模拟计划。
                  </p>
                )}
              </section>
              <aside className="record-detail">
                {record ? (
                  <>
                    <span className="badge">{sourceLabel(record.source)}</span>
                    <h2>{record.activity}</h2>
                    <p className="muted">
                      {new Date(record.startedAt).toLocaleString("zh-CN")}
                    </p>
                    <dl>
                      <dt>运动时长</dt>
                      <dd>{duration(record.activeMs)}</dd>
                      <dt>次数 / 命中</dt>
                      <dd>{record.reps}</dd>
                      {record.dribble && (
                        <>
                          <dt>最长连续运球</dt>
                          <dd>{record.dribble.longestStreak} 次</dd>
                          <dt>目标命中</dt>
                          <dd>{record.dribble.targetHits} 次</dd>
                          <dt>运球节奏</dt>
                          <dd>
                            {record.dribble.cadence === null
                              ? "数据不足"
                              : `${record.dribble.cadence.toFixed(0)} 次 / 分钟`}
                          </dd>
                        </>
                      )}
                      <dt>估算热量</dt>
                      <dd>
                        {record.estimatedKcal === null
                          ? "暂不估算"
                          : `${record.estimatedKcal} kcal`}
                      </dd>
                      <dt>保存状态</dt>
                      <dd>
                        {record.phase === "finished"
                          ? "已结束"
                          : "阶段记录，尚未收到结束事件"}
                      </dd>
                    </dl>
                    <p>{localAdvice(record).join("\n")}</p>
                    <button onClick={() => setPage("coach")}>
                      打开训练复盘
                    </button>
                  </>
                ) : (
                  <p className="muted">选择一条记录查看详情。</p>
                )}
              </aside>
            </div>
          </>
        )}
        {page === "coach" && (
          <>
            <div className="page-heading">
              <div>
                <h1>教练与分析</h1>
                <p>先看已有证据，再决定是否调用 AI。</p>
              </div>
            </div>
            <div className="coach-layout">
              <section className="analysis-sheet">
                <label>
                  选择训练记录
                  <select
                    value={record?.sessionId ?? ""}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="" disabled>
                      请选择
                    </option>
                    {data.records.map((r) => (
                      <option key={r.sessionId} value={r.sessionId}>
                        {r.source === "simulation" ? "[模拟] " : ""}
                        {r.activity} —{" "}
                        {new Date(r.startedAt).toLocaleString("zh-CN")}
                      </option>
                    ))}
                  </select>
                </label>
                <h2>本地复盘</h2>
                {record ? (
                  localAdvice(record).map((a) => (
                    <p className="finding" key={a}>
                      {a}
                    </p>
                  ))
                ) : (
                  <p>先完成一轮练习，再来查看复盘。</p>
                )}
                <h2>AI 建议</h2>
                <p className="muted">
                  点击后，将所选记录的活动名称、时长、次数、输入状态和本地结论发送到你配置的接口。不发送图片、视频、体重或设备信息。
                </p>
                <button
                  className="primary"
                  disabled={!record || analyzing || !data.ai.model}
                  onClick={async () => {
                    if (!record) return;
                    const id = record.sessionId;
                    setAnalyzing(true);
                    try {
                      const text = await run("askAI", id);
                      setAnswer({ id, text });
                    } catch {
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                >
                  {analyzing ? "正在分析…" : "发送摘要并分析"}
                </button>
                {!data.ai.model && (
                  <p className="muted">请先在右侧配置接口。</p>
                )}
                {!!answerText && (
                  <div className="ai-answer">
                    <h3>接口返回的建议</h3>
                    <p>{answerText}</p>
                    <small>
                      AI 建议供训练复盘参考，不代表已完成视觉动作检测。
                    </small>
                  </div>
                )}
              </section>
              <AISettings initial={data.ai} execute={execute} />
            </div>
          </>
        )}
        {page === "devices" && (
          <>
            <div className="page-heading">
              <div>
                <h1>设备与设置</h1>
                <p>在同一网络下连接，训练数据保留在本地。</p>
              </div>
            </div>
            <div className="settings-layout">
              <Pairing sync={data.sync} busy={busy} execute={execute} />
              <section className="settings-sheet">
                <h2>本地数据</h2>
                <Profile weight={data.weightKg} execute={execute} />
                <p className="muted">
                  体重仅保存在本机。当前游戏和模拟训练不提供运动强度依据，因此不会据此生成热量。
                </p>
                <label>
                  存储位置<code className="data-path">{data.dataPath}</code>
                </label>
                <div className="button-group">
                  <button
                    onClick={() => execute("export", undefined, "备份已导出")}
                  >
                    导出备份
                  </button>
                  <button
                    onClick={() => execute("import", undefined, "备份已合并")}
                  >
                    导入备份
                  </button>
                </div>
                <p className="muted">
                  备份包含计划和训练记录，不包含 AI 密钥或配对信息。
                </p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
function Empty({
  title,
  text,
  action,
  onClick,
}: {
  title: string;
  text: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}
function RecordRow({
  record: r,
  onClick,
  selected,
}: {
  record: TrainingRecord;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      className={`record-row ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <span className="record-date">
        {new Date(r.startedAt).toLocaleDateString("zh-CN", {
          month: "2-digit",
          day: "2-digit",
        })}
        <small>
          {new Date(r.startedAt).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </small>
      </span>
      <span className="record-name">
        <strong>{r.activity}</strong>
        <small>
          {sourceLabel(r.source)}
          {r.phase !== "finished" ? " · 阶段记录" : ""}
        </small>
      </span>
      <span>{duration(r.activeMs)}</span>
      <span className="muted">{r.reps} 次</span>
    </button>
  );
}
function Week({ records }: { records: TrainingRecord[] }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return (
    <div className="week-bars" aria-label="本周实际训练时长">
      {["一", "二", "三", "四", "五", "六", "日"].map((label, i) => {
        const from = +start + i * 86400000;
        const ms = records
          .filter(
            (r) =>
              Date.parse(r.startedAt) >= from &&
              Date.parse(r.startedAt) < from + 86400000,
          )
          .reduce((n, r) => n + r.activeMs, 0);
        return (
          <div key={label} title={`${Math.round(ms / 60000)} 分钟`}>
            <div className="bar-track">
              <div
                style={{ height: `${Math.min(100, (ms / 1800000) * 100)}%` }}
              />
            </div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
function PoseIllustration({ moving }: { moving: boolean }) {
  return (
    <svg
      className="pose-illustration"
      viewBox="0 0 360 250"
      role="img"
      aria-label="模拟姿态示意，非实时识别"
    >
      <path
        d="M40 223H320 M180 30V223"
        stroke="#D4E0E7"
        strokeDasharray="4 6"
      />
      <ellipse cx="180" cy="225" rx="85" ry="9" fill="#E1E9EE" />
      <g
        fill="none"
        stroke="#285F85"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="180" cy="48" r="19" fill="#EEF4F7" />
        <path
          d={
            moving
              ? "M180 75L177 135 M145 90L180 78L215 94 M145 90L119 124L99 104 M215 94L238 64L258 80 M177 135L146 169L129 214 M177 135L215 172L235 213"
              : "M180 75V135 M148 88L180 78L212 88 M148 88L136 142 M212 88L224 142 M180 135L155 212 M180 135L205 212"
          }
        />
      </g>
      <g fill="#FFFFFF" stroke="#26736C" strokeWidth="3">
        {[
          [180, 78],
          [177, 135],
          [145, 90],
          [215, 94],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="5" />
        ))}
      </g>
    </svg>
  );
}
function PlanEditor({
  plan,
  busy,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
}: {
  plan: TrainingPlan;
  busy: boolean;
  onChange: (p: TrainingPlan) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  function itemChange(index: number, key: string, value: string | number) {
    onChange({
      ...plan,
      items: plan.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    });
  }
  function move(index: number, by: number) {
    const items = [...plan.items];
    [items[index], items[index + by]] = [items[index + by], items[index]];
    onChange({ ...plan, items });
  }
  return (
    <>
      <div className="form-row">
        <label>
          计划名称
          <input
            maxLength={60}
            value={plan.name}
            onChange={(e) => onChange({ ...plan, name: e.target.value })}
          />
        </label>
        <label>
          安排日期
          <input
            type="date"
            value={plan.date}
            onChange={(e) => onChange({ ...plan, date: e.target.value })}
          />
        </label>
      </div>
      <div className="section-head">
        <h2>动作顺序</h2>
        <span>计时包含每组训练与组间休息</span>
      </div>
      <div className="exercise-editor">
        {plan.items.map((item, index) => (
          <div className="exercise-edit-row" key={item.id}>
            <span className="order">{index + 1}</span>
            <label className="exercise-name">
              动作
              <input
                aria-label={`动作 ${index + 1} 名称`}
                maxLength={60}
                value={item.name}
                onChange={(e) => itemChange(index, "name", e.target.value)}
              />
            </label>
            {(
              [
                ["sets", "组数", 1, 20],
                ["reps", "每组次数", 0, 200],
                ["workSeconds", "训练 / 秒", 5, 3600],
                ["restSeconds", "休息 / 秒", 0, 600],
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  aria-label={`${item.name} ${label}`}
                  min={min}
                  max={max}
                  value={item[key]}
                  onChange={(e) =>
                    itemChange(index, key, Number(e.target.value))
                  }
                />
              </label>
            ))}
            <div className="row-tools">
              <button
                aria-label={`上移动作 ${index + 1}`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                aria-label={`下移动作 ${index + 1}`}
                disabled={index === plan.items.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                aria-label={`删除动作 ${index + 1}`}
                disabled={plan.items.length === 1}
                onClick={() =>
                  onChange({
                    ...plan,
                    items: plan.items.filter((_, i) => index !== i),
                  })
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        disabled={plan.items.length >= 30}
        onClick={() =>
          onChange({
            ...plan,
            items: [
              ...plan.items,
              {
                id: crypto.randomUUID(),
                name: "新动作",
                sets: 1,
                reps: 0,
                workSeconds: 30,
                restSeconds: 15,
              },
            ],
          })
        }
      >
        添加动作
      </button>
      <p className="muted">
        次数为 0
        表示只按时长练习。模拟运行根据计划生成演示次数，不执行动作识别。
      </p>
      <div className="editor-actions">
        <button className="primary" disabled={busy} onClick={onSave}>
          保存计划
        </button>
        <button onClick={onDuplicate}>另存副本</button>
        <button className="danger text-button" onClick={onDelete}>
          删除计划
        </button>
      </div>
    </>
  );
}
function AISettings({
  initial,
  execute,
}: {
  initial: Snapshot["ai"];
  execute: (name: string, payload?: unknown, message?: string) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [apiKey, setKey] = useState("");
  return (
    <section className="settings-sheet">
      <h2>AI 接口</h2>
      <p>支持 chat/completions 格式的接口，也可填写本机模型服务地址。</p>
      <label>
        接口基础地址
        <input
          placeholder="https://你的服务地址/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </label>
      <label>
        模型名称
        <input
          placeholder="填写服务提供的模型名"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </label>
      <label>
        API 密钥
        <input
          type="password"
          autoComplete="off"
          placeholder={
            initial.hasKey ? "已保存，留空保留原密钥" : "本机模型可留空"
          }
          value={apiKey}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <button
        onClick={() => {
          execute("saveAI", { baseUrl, model, apiKey }, "接口配置已保存");
          setKey("");
        }}
      >
        保存接口配置
      </button>
      <button
        onClick={() =>
          execute(
            "testAI",
            undefined,
            "接口可访问，授权检查通过；指定模型需通过摘要分析验证",
          )
        }
      >
        测试已保存的接口
      </button>
      {initial.hasKey && (
        <button
          className="text-button danger"
          onClick={() => execute("clearAIKey", undefined, "密钥已清除")}
        >
          清除已存密钥
        </button>
      )}
      <small>
        密钥使用系统加密保存在本机。调用远程接口需要联网，可能产生费用。
      </small>
      <small>当前提供统计复盘，图像与视频动作复核尚未接入。</small>
    </section>
  );
}
function Profile({
  weight,
  execute,
}: {
  weight: number | null;
  execute: (name: string, payload?: unknown, message?: string) => void;
}) {
  const [value, setValue] = useState(weight?.toString() ?? "");
  return (
    <>
      <label>
        体重（kg，可选）
        <input
          type="number"
          min="20"
          max="300"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <button
        onClick={() =>
          execute("saveProfile", value ? Number(value) : null, "个人设置已保存")
        }
      >
        保存体重
      </button>
    </>
  );
}
function Pairing({
  sync,
  busy,
  execute,
}: {
  sync: Snapshot["sync"];
  busy: boolean;
  execute: (name: string, payload?: unknown, message?: string) => void;
}) {
  const [host, setHost] = useState("");
  const [qr, setQR] = useState("");
  const endpoint =
    sync.endpoints.find((e) => e.host === host) ?? sync.endpoints[0];
  useEffect(() => {
    let current = true;
    setQR("");
    if (endpoint)
      void QRCode.toDataURL(endpoint.uri, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      }).then((value) => {
        if (current) setQR(value);
      });
    return () => {
      current = false;
    };
  }, [endpoint?.uri]);
  return (
    <section className="settings-sheet pairing">
      <div className="section-head">
        <h2>连接手机</h2>
        <span className="badge">
          {sync.enabled ? "接收已开启" : "接收未开启"}
        </span>
      </div>
      <p>
        电脑和手机连接同一
        Wi-Fi，开启接收后，把配对链接填入手机的“连接电脑”页面。二维码为同一配对链接，当前版本可先用手动输入。
      </p>
      <button
        className={sync.enabled ? "" : "primary"}
        disabled={busy}
        onClick={() =>
          execute(
            sync.enabled ? "stopSync" : "startSync",
            undefined,
            sync.enabled ? "连接已关闭，旧配对已失效" : "已开启局域网接收",
          )
        }
      >
        {sync.enabled ? "关闭连接并撤销配对" : "开启局域网接收"}
      </button>
      {sync.error && <p className="warning">{sync.error}</p>}
      {sync.enabled && !endpoint && (
        <p className="warning">
          未找到局域网地址，请连接 Wi-Fi 或检查网络适配器。
        </p>
      )}
      {endpoint && (
        <>
          <label>
            电脑网络地址
            <select
              value={endpoint.host}
              onChange={(e) => setHost(e.target.value)}
            >
              {sync.endpoints.map((e) => (
                <option key={e.host} value={e.host}>
                  {e.host}
                </option>
              ))}
            </select>
          </label>
          <div className="pair-code">
            {qr && (
              <img src={qr} width="190" height="190" alt="手机配对二维码" />
            )}
            <div>
              <h3>{sync.peers.length ? "设备已连接" : "等待手机连接"}</h3>
              <p>
                配对有效至{" "}
                {new Date(sync.expiresAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                。重启电脑端需重新配对。
              </p>
              <button
                onClick={() =>
                  execute(
                    "copyPairing",
                    endpoint.host,
                    "配对链接已复制，请仅分享给自己的手机",
                  )
                }
              >
                复制配对链接
              </button>
            </div>
          </div>
          <label>
            手动配对链接
            <textarea
              readOnly
              rows={3}
              value={endpoint.uri}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </>
      )}
      {sync.peers.map((p) => (
        <p key={p.id}>
          <i className={`status-dot ${p.stale ? "muted-dot" : ""}`} />{" "}
          {p.id.slice(0, 12)} {p.stale ? "等待更新" : "已连接"}
        </p>
      ))}
      <small>
        仅在可信的私人网络开启。当前局域网传输未加密，配对链接具有连接权限，请勿公开。Windows
        可能提示允许本程序访问私人网络。
      </small>
    </section>
  );
}
class Boundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading">
        <h1>页面暂时无法显示</h1>
        <p>本地记录仍在电脑中，重新打开页面后继续。</p>
        <button onClick={() => location.reload()}>重新打开</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <App />
  </Boundary>,
);
