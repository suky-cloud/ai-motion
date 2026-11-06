import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { BackHandler, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import ComputerScreen from './sync/ComputerScreen';
import CameraScreen from './camera/CameraScreen';
import MotionCatchScreen from './games/MotionCatchScreen';
import ScreenBoundary from './application/ScreenBoundary';
import { appReducer, initialAppState } from './application/state';
import type { LastRound } from './application/state';
import type { RoundResult } from '../../../packages/session-core/src/session.ts';
import Button from './ui/ActionButton';
import { theme } from './ui/theme';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [pairingLink, setPairingLink] = useState('');
  useEffect(() => {
    const receive = (url: string | null | undefined) => { if (url?.startsWith('aimotion://pair?')) { setPairingLink(url); dispatch({ type: 'open', screen: 'computer' }); } };
    void Linking.getInitialURL().then(receive);
    const listener = Linking.addEventListener('url', event => receive(event.url));
    return () => listener.remove();
  }, []);
  const home = useCallback(() => dispatch({ type: 'home' }), []);
  const recordResult = useCallback((result: RoundResult) => {
    dispatch({ type: 'record-result', result, completedAt: new Date().toISOString() });
  }, []);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (state.route.name === 'home') return false;
      home();
      return true;
    });
    return () => listener.remove();
  }, [state.route.name, home]);
  const screen = state.route.name === 'computer' ? <ComputerScreen onClose={home} pairingLink={pairingLink} /> : state.route.name === 'camera' ? <CameraScreen onClose={home} /> :
    state.route.name === 'simulation' ? <MotionCatchScreen onClose={home} onResult={recordResult} /> :
      <HomeScreen lastRound={state.lastRound} onSimulation={() => dispatch({ type: 'open', screen: 'simulation' })}
        onCamera={() => dispatch({ type: 'open', screen: 'camera' })} onComputer={() => dispatch({ type: 'open', screen: 'computer' })} onClear={() => dispatch({ type: 'clear-result' })} />;
  return <ScreenBoundary key={`${state.route.name}-${state.nextRouteKey}`} onRecover={home}>{screen}</ScreenBoundary>;
}

function HomeScreen({ lastRound, onSimulation, onCamera, onComputer, onClear }: {
  lastRound: LastRound | null; onSimulation: () => void; onCamera: () => void; onComputer: () => void; onClear: () => void;
}) {
  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>AI Motion</Text>
        <View style={styles.intro}>
          <Text style={styles.title}>左右移动，{ '\n' }接住目标。</Text>
          <Text style={styles.description}>一轮 30 秒。左右移动，让光标跟上你。</Text>
        </View>
        <View style={styles.court} accessibilityLabel="Motion Catch 练习示意图">
          <View style={styles.track} />
          <View style={styles.cursor}><View style={styles.cursorDot} /></View>
          <View style={styles.target}><View style={styles.targetDot} /></View>
          <Text style={styles.courtCaption}>Motion Catch</Text>
        </View>
        <View style={styles.action}>
          <Text style={styles.sectionTitle}>先试一轮</Text>
          <Text style={styles.description}>拖动手指体验玩法，不需要开启摄像头。</Text>
          <Button title="开始模拟体验" onPress={onSimulation} />
          <Text style={styles.note}>当前是模拟输入，人体识别还在接入中。</Text>
        </View>
        {lastRound && <View style={styles.lastRound}>
          <Text style={styles.sectionTitle}>刚才那一轮</Text>
          <Text style={styles.description}>{lastRound.result.source === 'simulation' ? '模拟体验' : '身体互动'}接住 {lastRound.result.hits} 次，得分 {lastRound.result.score}。</Text>
          <Text style={styles.note}>这里显示本次结果，完整本地记录可在“连接电脑”中查看。</Text>
          <Pressable accessibilityRole="button" onPress={onClear} style={styles.clear}><Text style={styles.linkText}>清除本次结果</Text></Pressable>
        </View>}
        <Pressable accessibilityRole="button" style={styles.cameraLink} onPress={onComputer}>
          <View><Text style={styles.sectionTitle}>连接电脑</Text><Text style={styles.note}>本地训练记录与工作台同步</Text></View>
          <Text style={styles.linkText}>打开</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.cameraLink} onPress={onCamera}>
          <View><Text style={styles.sectionTitle}>检查摄像头</Text><Text style={styles.note}>前置预览与权限设置</Text></View>
          <Text style={styles.linkText}>打开</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, paddingTop: StatusBar.currentHeight ?? 0 },
  content: { padding: 24, paddingBottom: 40, gap: 24, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brand: { fontSize: 19, fontWeight: '700', color: '#20364A' },
  intro: { paddingTop: 12, gap: 14 },
  title: { fontSize: 32, fontWeight: '700', lineHeight: 43, letterSpacing: -0.5, color: '#20364A' },
  description: { fontSize: 15, lineHeight: 24, color: '#526677' },
  court: { height: 190, borderRadius: 12, backgroundColor: '#DFEAF0', justifyContent: 'center', overflow: 'hidden' },
  track: { position: 'absolute', left: 28, right: 28, height: 1, backgroundColor: '#9EB5C4' },
  cursor: { position: 'absolute', left: '23%', width: 45, height: 45, borderRadius: 23, borderWidth: 1, borderColor: '#285F85', alignItems: 'center', justifyContent: 'center' },
  cursorDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#285F85' },
  target: { position: 'absolute', right: '20%', width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: '#D94A60', alignItems: 'center', justifyContent: 'center' },
  targetDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D94A60' },
  courtCaption: { position: 'absolute', left: 20, bottom: 16, color: '#365970', fontSize: 14, fontWeight: '600' },
  action: { gap: 10 },
  sectionTitle: { color: '#20364A', fontSize: 18, fontWeight: '600' },
  lastRound: { gap: 8, paddingVertical: 16, borderTopWidth: 1, borderColor: theme.colors.border },
  clear: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  note: { fontSize: 13, lineHeight: 20, color: '#526677' },
  cameraLink: { paddingVertical: 20, borderTopWidth: 1, borderColor: '#CFDCE4', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 72 },
  linkText: { color: '#285F85', fontSize: 15, fontWeight: '600', padding: 12 },
});
