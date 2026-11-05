import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import CameraScreen from './camera/CameraScreen';
import MotionCatchScreen from './games/MotionCatchScreen';

export default function App() {
  const [screen, setScreen] = useState<'home' | 'camera' | 'game'>('home');
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      setScreen('home');
      return true;
    });
    return () => listener.remove();
  }, [screen]);
  if (screen === 'camera') return <CameraScreen onClose={() => setScreen('home')} />;
  if (screen === 'game') return <MotionCatchScreen onClose={() => setScreen('home')} />;
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
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={() => setScreen('game')}>
            <Text style={styles.primaryText}>开始模拟体验</Text>
          </Pressable>
          <Text style={styles.note}>当前是模拟输入，人体识别还在接入中。</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.cameraLink} onPress={() => setScreen('camera')}>
          <View><Text style={styles.sectionTitle}>检查摄像头</Text><Text style={styles.note}>前置预览与权限设置</Text></View>
          <Text style={styles.linkText}>打开</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F6F8', paddingTop: StatusBar.currentHeight ?? 0 },
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
  primary: { marginTop: 8, minHeight: 54, backgroundColor: '#285F85', alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  note: { fontSize: 13, lineHeight: 20, color: '#526677' },
  cameraLink: { paddingVertical: 20, borderTopWidth: 1, borderColor: '#CFDCE4', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 72 },
  linkText: { color: '#285F85', fontSize: 15, fontWeight: '600', padding: 12 },
});
