import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCameraPermission } from "react-native-vision-camera";
import {
  DribbleSession,
  NativeClockMapper,
  decodeBallFrame,
} from "../../../../packages/basketball-core/src/index.ts";
import type {
  BallFrame,
  DribbleMode,
} from "../../../../packages/basketball-core/src/index.ts";
import type { TrainingSample } from "../../../../packages/training-core/src/index.ts";
import BallCamera, { BallVision } from "./BallCamera";
import { trainingSync } from "../sync/trainingSync";
import Button from "../ui/ActionButton";
import { theme } from "../ui/theme";

const now = () => performance.now();
export default function DribbleScreen({
  onClose,
  simulation = false,
}: {
  onClose: () => void;
  simulation?: boolean;
}) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [mode, setMode] = useState<DribbleMode>("count");
  const [session, setSession] = useState(
    () => new DribbleSession("count", simulation ? "simulation" : "ball"),
  );
  const [, render] = useState(0);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("initial");
  const currentToken = useRef(token);
  currentToken.current = token;
  const [geometry, setGeometry] = useState({ width: 640, height: 480 });
  const [board, setBoard] = useState({ width: 300, height: 330 });
  const [detectorMs, setDetectorMs] = useState(0);
  const metadata = useRef({
    id: "",
    startedAt: "",
    seq: 0,
    lastWrite: -Infinity,
    phase: "idle",
  });
  const simulatedSide = useRef(0.25);
  const mounted = useRef(true);
  const nativeClock = useRef(new NativeClockMapper());
  function refresh() {
    render((v) => v + 1);
  }
  function publish() {
    const meta = metadata.current;
    if (!meta.id || session.phase === "idle") return;
    if (meta.phase === "finished") return;
    if (now() - meta.lastWrite < 1000 && meta.phase === session.phase) return;
    meta.seq++;
    meta.lastWrite = now();
    meta.phase = session.phase;
    const sample: TrainingSample = {
      version: 1,
      sessionId: meta.id,
      startedAt: meta.startedAt,
      seq: meta.seq,
      source: simulation ? "simulation" : "ball",
      activity:
        mode === "count" ? "原地运球计数（实验）" : "左右目标运球（实验）",
      phase: session.phase,
      activeMs: Math.round(session.elapsedMs),
      reps: session.result.reps,
      tracking: session.status === "tracking" ? "tracked" : "lost",
      confidence: session.ball?.confidence ?? 0,
      dribble: {
        mode,
        targetHits: session.result.targetHits,
        longestStreak: session.result.longestStreak,
        cadence: session.result.cadence,
        rhythmVariation: session.result.rhythmVariation,
      },
    };
    try {
      trainingSync.publish(sample);
    } catch {
      setError("本地记录未能保存，请检查记录页。");
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (session.phase === "running" && simulation) {
        const t = now();
        const frame: BallFrame = {
          timestampMs: t,
          width: 640,
          height: 480,
          mirrored: false,
          inferenceMs: 0,
          balls: [
            {
              x: simulatedSide.current,
              y: 0.5 - 0.22 * Math.cos((session.elapsedMs / 650) * Math.PI * 2),
              width: 0.09,
              height: 0.12,
              confidence: 1,
            },
          ],
        };
        session.accept(frame, t);
      }
      session.tick(now());
      publish();
      refresh();
    }, 50);
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        session.pause(now());
        currentToken.current = "background";
        setOpened(false);
        setReady(false);
        publish();
        refresh();
      }
    });
    return () => {
      clearInterval(timer);
      listener.remove();
      if (session.phase === "running" || session.phase === "paused") {
        session.finish(now());
        publish();
      }
    };
  }, [session]);
  async function openCamera() {
    setError("");
    try {
      if (!simulation && !BallVision)
        throw new Error("当前安装包不包含球体识别，请安装 0.4.0 新包。");
      if (!simulation && !(hasPermission || (await requestPermission())))
        throw new Error("未获得相机权限，可到系统设置开启。");
      if (!mounted.current) return;
      const next = `${Date.now()}-${Math.random()}`;
      nativeClock.current.reset();
      currentToken.current = next;
      setToken(next);
      setOpened(true);
      setReady(simulation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法开启相机");
    }
  }
  function start() {
    metadata.current = {
      id: `dribble-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      startedAt: new Date().toISOString(),
      seq: 0,
      lastWrite: -Infinity,
      phase: "idle",
    };
    session.start(now());
    publish();
    refresh();
  }
  function finish() {
    session.finish(now());
    currentToken.current = "finished";
    setOpened(false);
    setReady(false);
    publish();
    refresh();
  }
  function restart() {
    setOpened(false);
    setReady(false);
    setSession(new DribbleSession(mode, simulation ? "simulation" : "ball"));
  }
  function observation(event: {
    nativeEvent: { token: string; frame: BallFrame };
  }) {
    if (event.nativeEvent.token !== currentToken.current) return;
    const received = now();
    try {
      const data = decodeBallFrame(event.nativeEvent.frame);
      setGeometry({ width: data.width, height: data.height });
      setDetectorMs(data.inferenceMs);
      if (session.phase !== "running") return;
      session.accept(
        {
          ...data,
          timestampMs: nativeClock.current.map(data.timestampMs, received),
        },
        received,
      );
      refresh();
    } catch {
      session.pause(received);
      currentToken.current = "invalid";
      setOpened(false);
      setReady(false);
      setError("识别数据异常，本轮已暂停。");
      publish();
      refresh();
    }
  }
  const scale = Math.min(
    board.width / geometry.width,
    board.height / geometry.height,
  );
  const imageWidth = geometry.width * scale,
    imageHeight = geometry.height * scale;
  const left = (board.width - imageWidth) / 2,
    top = (board.height - imageHeight) / 2;
  const ball = session.ball;
  const result = session.result;
  const guidance = {
    tracking: "正在跟踪一个球体",
    lost: "未找到球，请让球进入画面",
    multiple: "画面内有多个球，计数已停止",
    jump: "球体位置变化过大，重新建立轨迹",
    stale: "等待新画面，旧轨迹已清除",
  }[session.status];
  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={styles.back}
        >
          <Text style={styles.link}>返回训练</Text>
        </Pressable>
        <Text style={styles.title}>把运球练得更稳。</Text>
        <Text style={styles.description}>
          {simulation
            ? "合成球轨迹演示，不使用摄像头。"
            : "单人、单球，固定前置机位。识别在手机本地运行。"}
        </Text>
        <Text style={styles.badge}>
          {simulation ? "模拟体验" : "球体计数实验版"} · 30 秒
        </Text>
        {session.phase === "idle" && (
          <View style={styles.row}>
            {(["count", "targets"] as const).map((m) => (
              <Button
                key={m}
                secondary={mode !== m}
                title={m === "count" ? "运球计数" : "左右目标"}
                onPress={() => {
                  setMode(m);
                  setSession(
                    new DribbleSession(m, simulation ? "simulation" : "ball"),
                  );
                }}
              />
            ))}
          </View>
        )}
        <View style={styles.metrics}>
          <View>
            <Text style={styles.note}>剩余秒数</Text>
            <Text style={styles.number}>
              {Math.ceil((30000 - session.elapsedMs) / 1000)}
            </Text>
          </View>
          <View>
            <Text style={styles.note}>估计运球</Text>
            <Text style={styles.number}>{result.reps}</Text>
          </View>
          <View>
            <Text style={styles.note}>
              {mode === "targets" ? "目标命中" : "最长连续"}
            </Text>
            <Text style={styles.number}>
              {mode === "targets" ? result.targetHits : result.longestStreak}
            </Text>
          </View>
        </View>
        <View
          style={styles.preview}
          onLayout={(e) =>
            setBoard({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          {opened && !simulation && (
            <BallCamera
              style={StyleSheet.absoluteFill}
              active={opened && session.phase !== "finished"}
              sessionToken={token}
              onObservation={observation}
              onReady={(e) => {
                if (e.nativeEvent.token === currentToken.current)
                  setReady(true);
              }}
              onFailure={(e) => {
                if (e.nativeEvent.token !== currentToken.current) return;
                session.pause(now());
                setError(e.nativeEvent.message);
                setOpened(false);
                setReady(false);
                publish();
                refresh();
              }}
            />
          )}
          {!opened && (
            <View style={styles.center}>
              <Text style={styles.previewTitle}>
                {session.phase === "finished" ? "这一轮已保存" : "先把手机放稳"}
              </Text>
              <Text style={styles.previewNote}>全身、球和身前地面保持入镜</Text>
            </View>
          )}
          {mode === "targets" && session.phase === "running" && (
            <View
              pointerEvents="none"
              style={[
                styles.zone,
                {
                  left:
                    left + (session.target === "left" ? 0 : 0.58 * imageWidth),
                  top,
                  width: 0.42 * imageWidth,
                  height: imageHeight,
                },
              ]}
            >
              <Text style={styles.zoneText}>
                {session.target === "left" ? "屏幕左侧" : "屏幕右侧"}
              </Text>
            </View>
          )}
          {ball && (
            <View
              pointerEvents="none"
              style={[
                styles.ball,
                {
                  left: left + (ball.x - ball.width / 2) * imageWidth,
                  top: top + (ball.y - ball.height / 2) * imageHeight,
                  width: ball.width * imageWidth,
                  height: ball.height * imageHeight,
                },
              ]}
            />
          )}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.description}>
          {session.phase === "running"
            ? guidance
            : session.phase === "paused"
              ? "计时已暂停，继续前需要新画面。"
              : session.phase === "finished"
                ? "记录已保存在手机，可同步到电脑。"
                : "相机就绪后再开始，预览期间不计数。"}
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {session.phase === "finished" ? (
          <>
            <Text style={styles.description}>
              节奏：
              {result.cadence === null
                ? "至少两次连续运球后计算"
                : `${result.cadence.toFixed(0)} 次 / 分钟`}
              。节奏波动：
              {result.rhythmVariation === null
                ? "至少四次连续运球后计算"
                : `${(result.rhythmVariation * 100).toFixed(0)}%`}
              。
            </Text>
            <Button title="再来一轮" onPress={restart} />
            <Button title="返回训练" secondary onPress={onClose} />
          </>
        ) : (
          <>
            {!opened && (
              <Button
                title={simulation ? "准备模拟" : "开启相机预览"}
                onPress={() => void openCamera()}
              />
            )}
            {session.phase === "idle" && (
              <Button title="开始 30 秒" disabled={!ready} onPress={start} />
            )}
            {(session.phase === "running" || session.phase === "paused") && (
              <View style={styles.row}>
                <Button
                  title={session.phase === "running" ? "暂停" : "继续"}
                  disabled={session.phase === "paused" && !ready}
                  onPress={() => {
                    if (session.phase === "running") {
                      session.pause(now());
                      setOpened(false);
                      setReady(false);
                      currentToken.current = "paused";
                    } else session.resume(now());
                    publish();
                    refresh();
                  }}
                />
                <Button title="结束并保存" secondary onPress={finish} />
              </View>
            )}
            {simulation && (
              <View style={styles.row}>
                <Button
                  title="把球移到左侧"
                  secondary
                  onPress={() => {
                    simulatedSide.current = 0.25;
                  }}
                />
                <Button
                  title="把球移到右侧"
                  secondary
                  onPress={() => {
                    simulatedSide.current = 0.75;
                  }}
                />
              </View>
            )}
          </>
        )}
        <Text style={styles.note}>
          {simulation
            ? "模拟结果不计入实际训练。"
            : "当前模型识别 sports ball 类别，不能保证区分篮球与其他球。"}{" "}
          按球体上下周期估计次数，不能证明球已触地，持球大幅晃动可能误计。遮挡、快速移动或低光照可能漏计；这里不判断左右手、动作规范或投篮命中。
        </Text>
        {!simulation && (
          <Text style={styles.note}>
            推理耗时：{detectorMs.toFixed(0)} ms /
            帧。无录像、无画面上传；不确定时停止计数，30 秒计时继续。
          </Text>
        )}
        {!!error && (
          <Button
            title="打开应用权限设置"
            secondary
            onPress={() => void Linking.openSettings()}
          />
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: StatusBar.currentHeight ?? 0,
  },
  content: {
    padding: 24,
    gap: 16,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 48,
  },
  back: { minHeight: 44, justifyContent: "center" },
  link: { color: theme.colors.primary, fontSize: 15 },
  title: { fontSize: 28, fontWeight: "600", color: theme.colors.ink },
  description: { fontSize: 14, lineHeight: 24, color: theme.colors.muted },
  note: { fontSize: 12, lineHeight: 21, color: theme.colors.muted },
  badge: { fontSize: 12, color: theme.colors.primary },
  row: { flexDirection: "row", gap: 10 },
  metrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  number: {
    fontSize: 36,
    color: theme.colors.ink,
    fontVariant: ["tabular-nums"],
  },
  preview: {
    height: 340,
    backgroundColor: "#172A37",
    borderRadius: 12,
    overflow: "hidden",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  previewTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "500" },
  previewNote: { color: "#BDCED9", fontSize: 13 },
  zone: {
    position: "absolute",
    backgroundColor: "#285F8538",
    borderWidth: 2,
    borderColor: "#B5D7E8",
    padding: 10,
  },
  zoneText: { color: "#FFFFFF", fontSize: 12 },
  ball: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#F3B35D",
    borderRadius: 99,
  },
  error: { color: "#A83C49", fontSize: 13, lineHeight: 22 },
});
