import React, { useCallback, useEffect, useReducer, useState } from "react";
import {
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import CameraScreen from "./camera/CameraScreen";
import MotionCatchScreen from "./games/MotionCatchScreen";
import ComputerScreen from "./sync/ComputerScreen";
import DribbleScreen from "./basketball/DribbleScreen";
import VideoCheckScreen from "./basketball/VideoCheckScreen";
import ScreenBoundary from "./application/ScreenBoundary";
import { appReducer, initialAppState } from "./application/state";
import type { MainTab, SubScreen } from "./application/state";
import type { RoundResult } from "../../../packages/session-core/src/session.ts";
import { trainingSync } from "./sync/trainingSync";
import { localAdvice } from "../../../packages/training-core/src/index.ts";
import type { TrainingSample } from "../../../packages/training-core/src/index.ts";
import Button from "./ui/ActionButton";
import { theme } from "./ui/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <Application />
    </SafeAreaProvider>
  );
}
function Application() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [pairingLink, setPairingLink] = useState("");
  const [records, setRecords] = useState<TrainingSample[]>([]);
  const [storageError, setStorageError] = useState("");
  const home = useCallback(() => dispatch({ type: "home" }), []);
  const select = (tab: MainTab) => dispatch({ type: "select-tab", tab });
  const open = (screen: SubScreen) => dispatch({ type: "open", screen });
  const recordResult = useCallback(
    (result: RoundResult) =>
      dispatch({
        type: "record-result",
        result,
        completedAt: new Date().toISOString(),
      }),
    [],
  );
  useEffect(() => {
    const receive = (url: string | null | undefined) => {
      if (url?.startsWith("aimotion://pair?")) {
        setPairingLink(url);
        dispatch({ type: "select-tab", tab: "profile" });
        dispatch({ type: "open", screen: "computer" });
      }
    };
    void Linking.getInitialURL().then(receive);
    const listener = Linking.addEventListener("url", (e) => receive(e.url));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    try {
      trainingSync.initialize();
      const update = () => {
        try {
          setRecords(trainingSync.history());
          setStorageError("");
        } catch {
          setStorageError("本地记录暂时无法读取，请检查安装版本。");
        }
      };
      update();
      return trainingSync.subscribe(update);
    } catch {
      setStorageError("本地记录模块不可用，请安装新版原生测试包。");
    }
  }, []);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (state.route.name !== "home") {
        home();
        return true;
      }
      if (state.tab !== "home") {
        dispatch({ type: "select-tab", tab: "home" });
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [state.route.name, state.tab, home]);
  let screen: React.ReactNode;
  if (state.route.name === "camera") screen = <CameraScreen onClose={home} />;
  else if (state.route.name === "simulation")
    screen = <MotionCatchScreen onClose={home} onResult={recordResult} />;
  else if (state.route.name === "computer")
    screen = <ComputerScreen onClose={home} pairingLink={pairingLink} />;
  else if (
    state.route.name === "dribble" ||
    state.route.name === "dribble-demo"
  )
    screen = (
      <DribbleScreen
        onClose={home}
        simulation={state.route.name === "dribble-demo"}
      />
    );
  else if (state.route.name === "video")
    screen = <VideoCheckScreen onClose={home} />;
  else
    screen = (
      <MainShell tab={state.tab} select={select}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.brand}>AI Motion</Text>
          {state.tab === "home" && (
            <>
              <Text style={styles.title}>今天，练一会儿球。</Text>
              <Text style={styles.description}>
                先把手机放稳，从一轮 30 秒开始。
              </Text>
              <View style={styles.feature}>
                <Text style={styles.featureLabel}>单人原地运球</Text>
                <Text style={styles.featureTitle}>
                  数完整的每一次，{"\n"}跟上自己的节奏。
                </Text>
                <Text style={styles.description}>
                  实验版球体计数与左右目标。识别在本机运行。
                </Text>
                <Button title="去训练" onPress={() => select("training")} />
              </View>
              <Text style={styles.sectionTitle}>最近一次练习</Text>
              {records[0] ? (
                <RecordCard record={records[0]} />
              ) : (
                <Text style={styles.description}>
                  还没有训练记录。可以先进入训练，或用模拟体验熟悉操作。
                </Text>
              )}
              <Text style={styles.note}>
                目前没有自动投篮 / 进球统计，也没有动作规范评分。
              </Text>
            </>
          )}
          {state.tab === "training" && (
            <>
              <Text style={styles.title}>训练</Text>
              <Text style={styles.description}>
                真人训练与模拟体验分开，所有识别结果都可复核。
              </Text>
              <TrainingEntry
                title="原地运球"
                description="前置相机，30 秒完整运球计数与节奏。支持左右目标挑战。"
                action="开启运球训练"
                onPress={() => open("dribble")}
                badge="本地识别 · 实验版"
              />
              <TrainingEntry
                title="先试运球玩法"
                description="使用合成球轨迹，检查计数、暂停和左右目标，不打开相机。"
                action="开始模拟"
                onPress={() => open("dribble-demo")}
                badge="模拟数据"
              />
              <TrainingEntry
                title="本地视频检查"
                description="选择一段运球视频，与手工计数对照。视频保留在手机。"
                action="选择视频"
                onPress={() => open("video")}
              />
              <TrainingEntry
                title="Motion Catch"
                description="拖动手指左右接住目标，原有模拟体验保留。"
                action="开始接目标"
                onPress={() => open("simulation")}
              />
              <View style={styles.coming}>
                <Text style={styles.sectionTitle}>投篮训练</Text>
                <Text style={styles.description}>
                  下一阶段接入固定机位的出手与进球统计，目前尚未开放。
                </Text>
              </View>
            </>
          )}
          {state.tab === "records" && (
            <>
              <Text style={styles.title}>训练记录</Text>
              <Text style={styles.description}>
                保存在手机本地，连接电脑后可以同步。视频检查不计入实际训练。
              </Text>
              {!!storageError && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {storageError}
                </Text>
              )}
              {records.map((record) => (
                <RecordCard key={record.sessionId} record={record} />
              ))}
              {!records.length && (
                <View style={styles.feature}>
                  <Text style={styles.sectionTitle}>第一轮记录还在等你</Text>
                  <Text style={styles.description}>
                    完成训练后，时长、次数和来源会出现在这里。
                  </Text>
                  <Button title="去训练" onPress={() => select("training")} />
                </View>
              )}
              <Text style={styles.note}>
                最多显示最近 100
                条；阶段记录表示未收到结束事件，不会冒充完整训练。
              </Text>
            </>
          )}
          {state.tab === "profile" && (
            <>
              <Text style={styles.title}>我的</Text>
              <Text style={styles.description}>管理设备连接和本机权限。</Text>
              <TrainingEntry
                title="电脑工作台"
                description="同一 Wi-Fi 下配对，同步记录和当前运动统计。"
                action="连接电脑"
                onPress={() => open("computer")}
              />
              <TrainingEntry
                title="摄像头检查"
                description="检查授权、前置预览与暂停恢复。"
                action="打开预览"
                onPress={() => open("camera")}
              />
              <View style={styles.coming}>
                <Text style={styles.sectionTitle}>数据与识别说明</Text>
                <Text style={styles.description}>
                  相机训练不录像、不上传画面。球体模型是通用 sports ball
                  检测器，实验计数不代表动作规范或消耗热量。
                </Text>
                <Text style={styles.note}>
                  AI 接口、训练计划与备份目前在电脑端管理。手机版本 0.4.0。
                </Text>
                {state.lastRound && (
                  <Button
                    title="清除本次游戏摘要"
                    secondary
                    onPress={() => dispatch({ type: "clear-result" })}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </MainShell>
    );
  return (
    <ScreenBoundary
      key={`${state.route.name}-${state.nextRouteKey}`}
      onRecover={home}
    >
      {screen}
    </ScreenBoundary>
  );
}
const tabs: { id: MainTab; title: string; icon: string }[] = [
  { id: "home", title: "首页", icon: "⌂" },
  { id: "training", title: "训练", icon: "◎" },
  { id: "records", title: "记录", icon: "▤" },
  { id: "profile", title: "我的", icon: "○" },
];
function MainShell({
  tab,
  select,
  children,
}: {
  tab: MainTab;
  select: (tab: MainTab) => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1 }}>{children}</View>
      <View
        accessibilityRole="tablist"
        style={[styles.tabs, { paddingBottom: Math.max(8, insets.bottom) }]}
      >
        {tabs.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            onPress={() => select(item.id)}
            style={styles.tab}
          >
            <Text style={[styles.tabIcon, tab === item.id && styles.selected]}>
              {item.icon}
            </Text>
            <Text style={[styles.tabLabel, tab === item.id && styles.selected]}>
              {item.title}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
function TrainingEntry({
  title,
  description,
  action,
  onPress,
  badge,
}: {
  title: string;
  description: string;
  action: string;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <View style={styles.entry}>
      {badge && <Text style={styles.featureLabel}>{badge}</Text>}
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Button title={action} secondary onPress={onPress} />
    </View>
  );
}
function RecordCard({ record }: { record: TrainingSample }) {
  const source = {
    simulation: "模拟体验",
    pose: "人体输入",
    ball: "球体识别实验",
    video: "本地视频检查",
  }[record.source];
  return (
    <View style={styles.record}>
      <View style={styles.recordHeading}>
        <Text style={styles.sectionTitle}>{record.activity}</Text>
        <Text style={styles.featureLabel}>{source}</Text>
      </View>
      <Text style={styles.description}>
        {(record.activeMs / 1000).toFixed(1)} 秒　{record.reps} 次
      </Text>
      {record.dribble && (
        <Text style={styles.description}>
          最长连续 {record.dribble.longestStreak} 次
          {record.dribble.mode === "targets"
            ? `，目标命中 ${record.dribble.targetHits} 次`
            : ""}
          。
          {record.dribble.cadence === null
            ? "节奏数据不足"
            : `节奏 ${record.dribble.cadence.toFixed(0)} 次 / 分钟`}
          。
        </Text>
      )}
      <Text style={styles.note}>
        {new Date(record.startedAt).toLocaleString()}　
        {record.phase === "finished" ? "已结束" : "阶段记录"}
      </Text>
      <Text style={styles.note}>{localAdvice(record)[0]}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: 24,
    paddingBottom: 32,
    gap: 20,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  brand: { fontSize: 18, fontWeight: "700", color: theme.colors.ink },
  title: {
    fontSize: 29,
    lineHeight: 40,
    fontWeight: "600",
    color: theme.colors.ink,
    marginTop: 10,
  },
  description: { fontSize: 14, lineHeight: 24, color: theme.colors.muted },
  note: { fontSize: 12, lineHeight: 21, color: theme.colors.muted },
  feature: {
    backgroundColor: "#E1EBF1",
    padding: 22,
    borderRadius: 12,
    gap: 16,
  },
  featureLabel: { fontSize: 12, color: theme.colors.primary },
  featureTitle: {
    fontSize: 24,
    lineHeight: 35,
    fontWeight: "600",
    color: theme.colors.ink,
  },
  sectionTitle: { fontSize: 17, fontWeight: "600", color: theme.colors.ink },
  entry: {
    gap: 12,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  coming: { gap: 12, paddingVertical: 16 },
  record: { backgroundColor: "#FFFFFF", padding: 18, borderRadius: 8, gap: 10 },
  recordHeading: { gap: 8 },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabIcon: { fontSize: 24, lineHeight: 26, color: "#7A8D9A" },
  tabLabel: { fontSize: 12, color: "#647786" },
  selected: { color: theme.colors.primary, fontWeight: "600" },
  error: { fontSize: 13, color: "#A83C49", lineHeight: 22 },
});
