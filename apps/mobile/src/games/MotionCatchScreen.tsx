import React, { useEffect, useRef, useState } from 'react';
import { createTelemetry } from '../sync/trainingSync';
import { Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { clamp } from '../../../../packages/motion-core/src/index.ts';
import type { Point, TrackingStatus } from '../../../../packages/motion-core/src/index.ts';
import { SimulationPoseSource } from '../../../../packages/session-core/src/sources.ts';
import type { RoundResult } from '../../../../packages/session-core/src/session.ts';
import { useMotionSession } from '../session/useMotionSession';
import LandmarkOverlay from '../vision/LandmarkOverlay';
import Button from '../ui/ActionButton';
import { theme } from '../ui/theme';

type SimulationMode = 'tracked' | 'lost' | 'partial';
const createSource = () => new SimulationPoseSource();
const statusText: Record<TrackingStatus, string> = {
  tracked: '跟着手指，左右接住目标', lost: '模拟输入已丢失，等待重新出现',
  'partial-body': '当前模拟仅上半身，控制已停止', stale: '模拟输入已过期，控制已停止',
};

export default function MotionCatchScreen({ onClose, onResult }: { onClose: () => void; onResult: (result: RoundResult) => void }) {
  const { height } = useWindowDimensions();
  const [board, setBoard] = useState({ width: 300, height: 330 });
  const [debug, setDebug] = useState(false);
  const [bones, setBones] = useState(false);
  const [mode, setMode] = useState<SimulationMode>('tracked');
  const point = useRef<Point>({ x: 0.5, y: 0.5 });
  const { snapshot, command, withSource } = useMotionSession(createSource, board, 'simulation', onResult);
  const telemetry = useRef<ReturnType<typeof createTelemetry> | null>(null);
  const [storageError, setStorageError] = useState(false);
  if (!telemetry.current) telemetry.current = createTelemetry();
  useEffect(() => { try { telemetry.current!.capture(snapshot); } catch { setStorageError(true); } }, [snapshot]);
  useEffect(() => () => { try { telemetry.current?.leave(); } catch {} }, []);
  const { game, result } = snapshot;

  function restart() {
    point.current = { x: 0.5, y: 0.5 };
    setMode('tracked');
    withSource(source => source.reset());
    command('start');
  }

  function move(event: GestureResponderEvent) {
    point.current = { x: clamp(event.nativeEvent.locationX / board.width, 0.12, 0.88),
      y: clamp(event.nativeEvent.locationY / board.height, 0.2, 0.65) };
    withSource(source => source.setPoint(point.current));
  }

  function nudge(delta: number) {
    point.current = { x: clamp(point.current.x + delta, 0.12, 0.88), y: 0.5 };
    withSource(source => source.setPoint(point.current));
  }

  const cursorRadius = board.width * 0.025;
  const targetRadius = board.width * 0.05;
  const running = game.phase === 'running';
  const remaining = Math.max(0, Math.ceil((game.durationMs - game.elapsedMs) / 1000));

  return <View style={styles.page}>
    <StatusBar barStyle="dark-content" />
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.back}><Text style={styles.link}>返回</Text></Pressable>
      <View style={styles.heading}>
        <Text style={styles.title}>Motion Catch</Text>
        <Text style={styles.subtitle}>30 秒内，左右移动接住目标。</Text>
      </View>
      <Text style={styles.simulation}>模拟体验 · 未使用摄像头识别</Text>
      {storageError && <Text accessibilityRole="alert" style={styles.guidance}>本地记录暂时无法保存，当前仍可体验。请稍后检查“连接电脑”页面。</Text>}
      {snapshot.issue && <Text accessibilityRole="alert" style={styles.guidance}>输入模块出现问题，请重试或返回首页。</Text>}
      {result ? <>
        <View style={styles.result}>
          <Text style={styles.resultLabel}>这一轮，接住了 {result.hits} 次</Text>
          <Text style={styles.resultScore}>{result.score}<Text style={styles.scoreUnit}> 分</Text></Text>
          <Text style={styles.subtitle}>{result.endReason === 'timeout' ? '30 秒结束' : '本轮已结束'}</Text>
        </View>
        <View style={styles.resultRows}>
          <View style={styles.resultRow}><Text style={styles.muted}>练习时长</Text><Text style={styles.value}>{(result.durationMs / 1000).toFixed(1)} 秒</Text></View>
          <View style={styles.resultRow}><Text style={styles.muted}>有效输入时长</Text><Text style={styles.value}>{(result.validInputMs / 1000).toFixed(1)} 秒</Text></View>
          <View style={styles.resultRow}><Text style={styles.muted}>平均命中间隔</Text><Text style={styles.value}>{result.averageHitIntervalMs === null ? '至少命中两次后计算' : `${(result.averageHitIntervalMs / 1000).toFixed(2)} 秒`}</Text></View>
        </View>
        <Text style={styles.help}>这是模拟输入的游戏结果，不代表实际运动表现。</Text>
        <Button title="再来一轮" onPress={restart} />
        <Button title="回到首页" onPress={onClose} secondary />
      </> : <>
        <View style={styles.stats}>
          <View><Text style={styles.statLabel}>剩余</Text><Text style={styles.stat}>{remaining}<Text style={styles.statUnit}> 秒</Text></Text></View>
          <View><Text style={styles.statLabel}>得分</Text><Text style={styles.stat}>{game.score}</Text></View>
          <View><Text style={styles.statLabel}>命中</Text><Text style={styles.stat}>{game.hitTimesMs.length}</Text></View>
        </View>
        <View style={[styles.board, { height: Math.max(240, Math.min(360, height * 0.4)) }]}
          onLayout={event => { const { width, height: boardHeight } = event.nativeEvent.layout; if (width > 0 && boardHeight > 0) setBoard({ width, height: boardHeight }); }}
          accessibilityLabel="拖动练习场移动光标，也可使用下方向左向右按钮"
          onStartShouldSetResponder={() => running} onMoveShouldSetResponder={() => running}
          onResponderGrant={move} onResponderMove={move}>
          <View pointerEvents="none" style={styles.lane} />
          {bones && running && <LandmarkOverlay pose={snapshot.pose} transform={snapshot.transform} />}
          {game.target && <View pointerEvents="none" style={[styles.target, { width: targetRadius * 2, height: targetRadius * 2, borderRadius: targetRadius,
            left: game.target.x * board.width - targetRadius, top: game.target.y * board.height - targetRadius }]} />}
          {game.cursor && <View pointerEvents="none" style={[styles.cursor, { width: cursorRadius * 2, height: cursorRadius * 2, borderRadius: cursorRadius,
            left: game.cursor.x * board.width - cursorRadius, top: game.cursor.y * board.height - cursorRadius }]} />}
          {game.phase !== 'running' && <View pointerEvents="none" style={styles.boardOverlay}>
            <Text style={styles.boardTitle}>{game.phase === 'paused' ? '歇一会儿' : '把光标带到目标里'}</Text>
            <Text style={styles.help}>{game.phase === 'paused' ? '时间和计分都已暂停' : '开始后，拖动手指试试看'}</Text>
          </View>}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.guidance}>{snapshot.issue ? '输入暂时不可用，这一轮已暂停。点击继续可重试。' : running ? statusText[snapshot.tracking] : game.phase === 'paused' ? '准备好后继续，目标会留在原处。' : '珊瑚色圆环是目标，蓝点是你的光标。'}</Text>
        {running && <View style={styles.controls}>
          <Button title="向左" secondary onPress={() => nudge(-0.1)} />
          <Button title="向右" secondary onPress={() => nudge(0.1)} />
        </View>}
        {game.phase === 'idle' ? <Button title="开始这一轮" onPress={restart} /> : <View style={styles.controls}>
          <Button title={running ? '暂停' : '继续'} onPress={() => command(running ? 'pause' : 'resume')} />
          <Button title="结束" secondary onPress={() => command('finish')} />
        </View>}
        <Text style={styles.help}>每次命中 10 分。输入丢失时停止控制，倒计时继续；点击暂停可停下计时。</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: debug }} style={styles.debugToggle} onPress={() => setDebug(value => !value)}>
          <Text style={styles.link}>{debug ? '收起调试信息' : '调试信息'}</Text>
        </Pressable>
        {debug && <View style={styles.debug}>
          <Text style={styles.debugText}>输入来源：合成姿态 / 相机与模型未启用</Text>
          <Text style={styles.debugText}>状态：{snapshot.tracking}　置信度：{snapshot.confidence.toFixed(2)}</Text>
          {snapshot.issue && <Text style={styles.debugText}>输入异常：{snapshot.issue}</Text>}
          <Text style={styles.debugText}>目标：{game.target ? `${game.target.x.toFixed(2)}, ${game.target.y.toFixed(2)}` : '未生成'}</Text>
          <Text style={styles.debugText}>光标：{game.cursor ? `${game.cursor.x.toFixed(2)}, ${game.cursor.y.toFixed(2)}` : '无有效输入'}</Text>
          <View style={styles.switchRow}><Text style={styles.debugText}>显示合成骨骼</Text><Switch accessibilityLabel="显示合成骨骼" value={bones} onValueChange={setBones} /></View>
          <View style={styles.modeRow}>
            {(['tracked', 'lost', 'partial'] as const).map((item, index) => <Pressable key={item} accessibilityRole="button"
              accessibilityState={{ selected: mode === item }} onPress={() => { setMode(item); withSource(source => source.setMode(item)); }} style={[styles.mode, mode === item && styles.modeSelected]}>
              <Text style={mode === item ? styles.buttonText : styles.secondaryText}>{['正常输入', '输入丢失', '仅上半身'][index]}</Text>
            </Pressable>)}
          </View>
        </View>}
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, paddingTop: StatusBar.currentHeight ?? 0 },
  content: { padding: 24, paddingTop: 8, paddingBottom: 40, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', minWidth: 64 },
  link: { color: '#285F85', fontSize: 15, fontWeight: '600' },
  heading: { gap: 8 },
  title: { color: '#20364A', fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: '#526677', fontSize: 15, lineHeight: 23 },
  simulation: { alignSelf: 'flex-start', color: '#365970', backgroundColor: '#E1EBF1', paddingVertical: 7, paddingHorizontal: 10, fontSize: 12, borderRadius: 4 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statLabel: { color: '#526677', fontSize: 13, marginBottom: 6 },
  stat: { color: '#20364A', fontSize: 32, lineHeight: 40, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 14, fontWeight: '400' },
  board: { backgroundColor: '#E0EAF0', borderRadius: 12, overflow: 'hidden' },
  lane: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: '#ADC1CD' },
  target: { position: 'absolute', borderWidth: 3, borderColor: '#D94A60', backgroundColor: '#F6DEE4' },
  cursor: { position: 'absolute', backgroundColor: '#285F85' },
  boardOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#E0EAF0F2', padding: 20 },
  boardTitle: { color: '#20364A', fontSize: 20, fontWeight: '600', textAlign: 'center' },
  guidance: { color: '#365970', fontSize: 14, lineHeight: 22, minHeight: 22 },
  help: { color: '#526677', fontSize: 13, lineHeight: 21 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  secondaryText: { color: '#285F85', fontSize: 15, fontWeight: '600' },
  controls: { flexDirection: 'row', gap: 12 },
  debugToggle: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderColor: '#CFDCE4' },
  debug: { backgroundColor: '#FFFFFF', padding: 16, gap: 12, borderRadius: 8 },
  debugText: { color: '#526677', fontSize: 12, lineHeight: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mode: { padding: 10, minHeight: 44, justifyContent: 'center', backgroundColor: '#EFF4F7', borderRadius: 6 },
  modeSelected: { backgroundColor: '#285F85' },
  result: { paddingVertical: 30, gap: 16 },
  resultLabel: { color: '#20364A', fontSize: 21, fontWeight: '600' },
  resultScore: { color: '#285F85', fontSize: 72, lineHeight: 84, fontWeight: '600', fontVariant: ['tabular-nums'] },
  scoreUnit: { fontSize: 20, fontWeight: '400' },
  resultRows: { paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#CFDCE4', gap: 8 },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  muted: { color: '#526677', fontSize: 14 },
  value: { color: '#20364A', fontSize: 14, fontWeight: '500' },
});
