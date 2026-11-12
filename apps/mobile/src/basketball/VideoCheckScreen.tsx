import React, { useRef, useState, useEffect } from "react";
import { ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import {
  DribbleSession,
  decodeBallFrame,
} from "../../../../packages/basketball-core/src/index.ts";
import type { DribbleResult } from "../../../../packages/basketball-core/src/index.ts";
import { BallVision } from "./BallCamera";
import Button from "../ui/ActionButton";
import { theme } from "../ui/theme";
export default function VideoCheckScreen({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<{
    summary: DribbleResult;
    frames: number;
    detected: number;
    inferenceMs: number;
    durationMs: number;
  } | null>(null);
  const job = useRef(0);
  useEffect(
    () => () => {
      job.current++;
    },
    [],
  );
  async function pick() {
    setError("");
    if (!BallVision) {
      setError("请安装包含识别模块的新版 Android 测试包。");
      return;
    }
    setBusy(true);
    const current = ++job.current;
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: "video/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selected.canceled) return;
      if (
        selected.assets[0].size &&
        selected.assets[0].size > 100 * 1024 * 1024
      )
        throw new Error("请选择小于 100 MB、长度不超过 60 秒的视频。");
      const data = await BallVision.analyzeVideo(selected.assets[0].uri);
      if (job.current !== current) return;
      const session = new DribbleSession("count", "video");
      session.start(0);
      let detected = 0,
        totalInference = 0,
        frames = 0;
      for (const raw of data.frames) {
        const frame = decodeBallFrame(raw);
        if (frame.timestampMs >= 30000) break;
        session.accept(raw, frame.timestampMs);
        if (frame.balls.length === 1) detected++;
        totalInference += frame.inferenceMs;
        frames++;
      }
      session.finish(Math.min(30000, data.durationMs));
      setResult({
        summary: session.result,
        frames,
        detected,
        inferenceMs: frames ? totalInference / frames : 0,
        durationMs: Math.min(30000, data.durationMs),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "视频无法分析，请检查格式或选择其他文件。",
      );
    } finally {
      if (job.current === current) setBusy(false);
    }
  }
  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          title="返回训练"
          secondary
          onPress={() => {
            job.current++;
            onClose();
          }}
        />
        <Text style={styles.title}>检查一段运球视频</Text>
        <Text style={styles.text}>
          主动选择本地文件，在手机上解码与识别。分析前 30
          秒，不上传、不存为实际训练，不修改原视频。
        </Text>
        <Button
          title={busy ? "正在本地分析，请稍候…" : "选择本地视频"}
          disabled={busy}
          onPress={() => void pick()}
        />
        <Text style={styles.note}>
          视频不超过 60 秒 / 100
          MB，建议单人单球、全身和地面入镜。处理速度取决于手机性能。
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {result && (
          <View style={styles.result}>
            <Text style={styles.label}>检测结果（未校准实验）</Text>
            <Text style={styles.number}>{result.summary.reps} 次</Text>
            <Text style={styles.text}>
              分析 {(result.durationMs / 1000).toFixed(1)} 秒，共{" "}
              {result.frames} 帧，单球出现 {result.detected} 帧。
            </Text>
            <Text style={styles.text}>
              平均推理耗时 {result.inferenceMs.toFixed(0)} ms / 帧。
            </Text>
            <Text style={styles.text}>
              请手工数同一时间段的完整运球，记录漏计与多计。算法结果不能作为准确率已达标的证明。
            </Text>
          </View>
        )}
        <Text style={styles.note}>
          选择器将视频复制到应用缓存，系统可回收缓存。不展示退出前的结果；离开页面不取消已经开始的原生计算。投篮、进球和左右手识别尚未实现。
        </Text>
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
    gap: 18,
    paddingBottom: 48,
    maxWidth: 560,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 27, color: theme.colors.ink, fontWeight: "600" },
  text: { fontSize: 14, lineHeight: 24, color: theme.colors.muted },
  note: { fontSize: 12, lineHeight: 21, color: theme.colors.muted },
  error: { fontSize: 13, lineHeight: 22, color: "#A83C49" },
  result: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 20,
    gap: 16,
  },
  label: { fontSize: 15, color: theme.colors.ink },
  number: { fontSize: 36, color: theme.colors.primary },
});
