import React, { useEffect, useState } from 'react';
import { AppState, BackHandler, Linking, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraPermission } from 'react-native-vision-camera';

export default function App() {
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const [opened, setOpened] = useState(false);
  const [paused, setPaused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    const listener = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!opened) return false;
      setOpened(false);
      setPaused(false);
      setPreviewReady(false);
      return true;
    });
    return () => listener.remove();
  }, [opened]);

  async function start() {
    setError(null);
    if (!hasPermission && !canRequestPermission) {
      setDenied(true);
      return;
    }
    try {
      const granted = hasPermission || await requestPermission();
      setDenied(!granted);
      if (granted) {
        setPaused(false);
        setPreviewReady(false);
        setOpened(true);
      }
    } catch {
      setError('无法申请摄像头权限，请检查系统设置后重试。');
    }
  }

  const active = opened && !paused && foreground && hasPermission && !error;

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AI MOTION · P0</Text>
        <Text style={styles.title}>让身体成为控制器</Text>
        <Text style={styles.subtitle}>第一步：验证前置摄像头</Text>
      </View>
      <View style={styles.preview}>
        {opened && hasPermission ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device="front"
            isActive={active}
            onStarted={() => console.info('[AI Motion] camera started')}
            onStopped={() => { setPreviewReady(false); console.info('[AI Motion] camera stopped'); }}
            onPreviewStarted={() => { setPreviewReady(true); console.info('[AI Motion] preview started'); }}
            onError={cameraError => setError(cameraError.message)}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderTitle}>准备好，站到镜头前</Text>
            <Text style={styles.hint}>点击下方按钮开启摄像头</Text>
          </View>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{error ? '摄像头异常' : !opened ? '摄像头未开启' : !active ? '摄像头已暂停' : previewReady ? '前置摄像头 · 预览中' : '正在启动摄像头'}</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.privacy}>画面仅在本机预览，不录制、不上传</Text>
        <Text style={styles.hint}>姿态识别尚未接入</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {denied && <Text accessibilityRole="alert" style={styles.error}>需要摄像头权限。若系统不再弹窗，请前往设置开启。</Text>}
        {!opened ? (
          <Pressable accessibilityRole="button" style={styles.primary} onPress={start}>
            <Text style={styles.primaryText}>开启摄像头</Text>
          </Pressable>
        ) : (
          <View style={styles.row}>
            <Pressable accessibilityRole="button" style={[styles.primary, styles.flex]} onPress={() => { if (error) { setError(null); setPaused(false); } else { setPaused(value => !value); } }}>
              <Text style={styles.primaryText}>{error ? '重试摄像头' : paused ? '恢复预览' : '暂停预览'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => { setOpened(false); setPaused(false); setPreviewReady(false); setError(null); }}>
              <Text style={styles.secondaryText}>结束</Text>
            </Pressable>
          </View>
        )}
        {denied && <Pressable accessibilityRole="button" onPress={() => Linking.openSettings().catch(() => setError('无法打开设置，请手动前往系统应用权限页。'))}><Text style={styles.settings}>前往系统设置</Text></Pressable>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#101a20', paddingTop: StatusBar.currentHeight ?? 0 },
  header: { padding: 24, gap: 8 },
  eyebrow: { color: '#74e3bd', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#f5f8fa', fontSize: 27, fontWeight: '700' },
  subtitle: { color: '#a4b5bf', fontSize: 14 },
  preview: { flex: 1, marginHorizontal: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: '#1d303a' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholderTitle: { color: '#edf4f6', fontSize: 20, fontWeight: '600' },
  hint: { color: '#a4b5bf', fontSize: 13, textAlign: 'center' },
  badge: { position: 'absolute', top: 16, left: 16, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#101a20cc' },
  badgeText: { color: '#bdf5df', fontSize: 12 },
  footer: { padding: 24, gap: 12 },
  privacy: { color: '#d5e4ea', textAlign: 'center', fontSize: 13 },
  primary: { backgroundColor: '#86efc5', minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: '#102d23', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  secondary: { minHeight: 52, paddingHorizontal: 26, borderRadius: 16, borderWidth: 1, borderColor: '#52707f', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#e5edf2', fontSize: 16 },
  error: { color: '#ffb4a9', fontSize: 13, textAlign: 'center' },
  settings: { color: '#86efc5', textAlign: 'center', padding: 8 },
});
