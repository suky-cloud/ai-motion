import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { BodyController, clamp, SKELETON } from '../../../../packages/motion-core/src/index.ts';
import type { Point, PoseFrame, TrackingStatus } from '../../../../packages/motion-core/src/index.ts';
import { simulatedPose } from '../../../../packages/motion-core/src/simulation.ts';
import { advanceGame, createGame, finishGame, gameResult, pauseGame, resumeGame, startGame } from '../../../../packages/game-core/src/index.ts';

type SimulationMode = 'tracked' | 'lost' | 'partial';
const clock = () => performance.now();
const statusText: Record<TrackingStatus, string> = {
  tracked: '跟着手指，左右接住目标', lost: '模拟输入已丢失，等待重新出现',
  'partial-body': '当前模拟仅上半身，控制已停止', stale: '模拟输入已过期，控制已停止',
};

function Button({ title, onPress, secondary = false }: { title: string; onPress: () => void; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, pressed && { opacity: 0.75 }]}>
    <Text style={secondary ? styles.secondaryText : styles.buttonText}>{title}</Text>
  </Pressable>;
}

function Skeleton({ pose, width, height }: { pose: PoseFrame | null; width: number; height: number }) {
  if (!pose?.isTracked) return null;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {SKELETON.map(([a, b]) => {
      const from = pose.landmarks[a], to = pose.landmarks[b];
      if (!from || !to || (from.visibility ?? 0) < 0.5 || (to.visibility ?? 0) < 0.5) return null;
      const dx = (to.x - from.x) * width, dy = (to.y - from.y) * height;
      const length = Math.hypot(dx, dy);
      return <View key={`${a}-${b}`} style={{ position: 'absolute', height: 2, width: length, backgroundColor: '#689BA0',
        left: (from.x + to.x) * width / 2 - length / 2, top: (from.y + to.y) * height / 2 - 1,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
    })}
    {pose.landmarks.map((landmark, index) => (landmark.visibility ?? 0) >= 0.5 &&
      <View key={index} style={{ position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: '#26736C', left: landmark.x * width - 2.5, top: landmark.y * height - 2.5 }} />)}
  </View>;
}

export default function MotionCatchScreen({ onClose }: { onClose: () => void }) {
  const { height } = useWindowDimensions();
  const [game, setGame] = useState(() => createGame('simulation'));
  const [board, setBoard] = useState({ width: 300, height: 330 });
  const [debug, setDebug] = useState(false);
  const [bones, setBones] = useState(false);
  const [mode, setMode] = useState<SimulationMode>('tracked');
  const [telemetry, setTelemetry] = useState<{ status: TrackingStatus; pose: PoseFrame | null; confidence: number }>({ status: 'lost', pose: null, confidence: 0 });
  const point = useRef<Point>({ x: 0.5, y: 0.5 });
  const simulationMode = useRef(mode);
  const controller = useRef(new BodyController());
  simulationMode.current = mode;
  const result = gameResult(game);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        setGame(current => pauseGame(current, clock()));
        controller.current.reset();
      }
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (game.phase !== 'running') return;
    const timer = setInterval(() => {
      const now = clock();
      const pose = simulatedPose(point.current, now, simulationMode.current);
      const next = controller.current.update(pose, now, {
        sourceWidth: board.width, sourceHeight: board.height, viewWidth: board.width, viewHeight: board.height,
        rotation: 0, mirrored: false, resizeMode: 'cover',
      }, 'simulation');
      setTelemetry({ pose, status: next.status, confidence: next.input.confidence });
      setGame(current => advanceGame(current, now, next.input, Math.random, board.width / board.height));
    }, 50);
    return () => clearInterval(timer);
  }, [game.phase, board.width, board.height]);

  function restart() {
    controller.current.reset();
    point.current = { x: 0.5, y: 0.5 };
    setMode('tracked');
    simulationMode.current = 'tracked';
    setTelemetry({ status: 'lost', pose: null, confidence: 0 });
    setGame(current => startGame(current, clock()));
  }

  function move(event: GestureResponderEvent) {
    point.current = { x: clamp(event.nativeEvent.locationX / board.width, 0.12, 0.88),
      y: clamp(event.nativeEvent.locationY / board.height, 0.2, 0.65) };
  }

  function nudge(delta: number) {
    point.current = { x: clamp(point.current.x + delta, 0.12, 0.88), y: 0.5 };
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
          {bones && running && <Skeleton pose={telemetry.pose} width={board.width} height={board.height} />}
          {game.target && <View pointerEvents="none" style={[styles.target, { width: targetRadius * 2, height: targetRadius * 2, borderRadius: targetRadius,
            left: game.target.x * board.width - targetRadius, top: game.target.y * board.height - targetRadius }]} />}
          {game.cursor && <View pointerEvents="none" style={[styles.cursor, { width: cursorRadius * 2, height: cursorRadius * 2, borderRadius: cursorRadius,
            left: game.cursor.x * board.width - cursorRadius, top: game.cursor.y * board.height - cursorRadius }]} />}
          {game.phase !== 'running' && <View pointerEvents="none" style={styles.boardOverlay}>
            <Text style={styles.boardTitle}>{game.phase === 'paused' ? '歇一会儿' : '把光标带到目标里'}</Text>
            <Text style={styles.help}>{game.phase === 'paused' ? '时间和计分都已暂停' : '开始后，拖动手指试试看'}</Text>
          </View>}
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.guidance}>{running ? statusText[telemetry.status] : game.phase === 'paused' ? '准备好后继续，目标会留在原处。' : '珊瑚色圆环是目标，蓝点是你的光标。'}</Text>
        {running && <View style={styles.controls}>
          <Button title="向左" secondary onPress={() => nudge(-0.1)} />
          <Button title="向右" secondary onPress={() => nudge(0.1)} />
        </View>}
        {game.phase === 'idle' ? <Button title="开始这一轮" onPress={restart} /> : <View style={styles.controls}>
          <Button title={running ? '暂停' : '继续'} onPress={() => {
            controller.current.reset();
            setGame(current => current.phase === 'running' ? pauseGame(current, clock()) : resumeGame(current, clock()));
          }} />
          <Button title="结束" secondary onPress={() => setGame(current => finishGame(current, clock()))} />
        </View>}
        <Text style={styles.help}>每次命中 10 分。输入丢失时停止控制，倒计时继续；点击暂停可停下计时。</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: debug }} style={styles.debugToggle} onPress={() => setDebug(value => !value)}>
          <Text style={styles.link}>{debug ? '收起调试信息' : '调试信息'}</Text>
        </Pressable>
        {debug && <View style={styles.debug}>
          <Text style={styles.debugText}>输入来源：合成姿态 / 相机与模型未启用</Text>
          <Text style={styles.debugText}>状态：{telemetry.status}　置信度：{telemetry.confidence.toFixed(2)}</Text>
          <Text style={styles.debugText}>目标：{game.target ? `${game.target.x.toFixed(2)}, ${game.target.y.toFixed(2)}` : '未生成'}</Text>
          <Text style={styles.debugText}>光标：{game.cursor ? `${game.cursor.x.toFixed(2)}, ${game.cursor.y.toFixed(2)}` : '无有效输入'}</Text>
          <View style={styles.switchRow}><Text style={styles.debugText}>显示合成骨骼</Text><Switch accessibilityLabel="显示合成骨骼" value={bones} onValueChange={setBones} /></View>
          <View style={styles.modeRow}>
            {(['tracked', 'lost', 'partial'] as const).map((item, index) => <Pressable key={item} accessibilityRole="button"
              accessibilityState={{ selected: mode === item }} onPress={() => setMode(item)} style={[styles.mode, mode === item && styles.modeSelected]}>
              <Text style={mode === item ? styles.buttonText : styles.secondaryText}>{['正常输入', '输入丢失', '仅上半身'][index]}</Text>
            </Pressable>)}
          </View>
        </View>}
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F6F8', paddingTop: StatusBar.currentHeight ?? 0 },
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
  button: { flexGrow: 1, minHeight: 52, borderRadius: 10, backgroundColor: '#285F85', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  secondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BDCED9' },
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
