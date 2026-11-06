import React, { useEffect, useState } from 'react';
import { PermissionsAndroid, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { trainingSync } from './trainingSync';
import Button from '../ui/ActionButton';
import { theme } from '../ui/theme';

export default function ComputerScreen({ onClose, pairingLink }: { onClose: () => void; pairingLink?: string }) {
  const [link, setLink] = useState(pairingLink ?? '');
  const [status, setStatus] = useState(trainingSync.status());
  const [count, setCount] = useState(0);
  const [records, setRecords] = useState<ReturnType<typeof trainingSync.history>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    try { trainingSync.initialize(); const update = () => { setStatus(trainingSync.status()); setCount(trainingSync.pendingCount()); setRecords(trainingSync.history()); }; update(); return trainingSync.subscribe(update); }
    catch { setError('本地记录模块未能打开。请安装新版开发包，不要卸载旧版数据。'); }
  }, []);
  useEffect(() => { if (pairingLink) setLink(pairingLink); }, [pairingLink]);
  return <View style={styles.page}><StatusBar barStyle="dark-content"/><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button title="返回首页" onPress={onClose} secondary/><Text style={styles.title}>连接电脑</Text>
    <Text style={styles.text}>电脑端打开“设备与设置”，开启局域网接收。确保手机与电脑在同一 Wi-Fi，把配对链接粘贴到下面。</Text>
    <Text style={styles.label}>电脑配对链接</Text><TextInput accessibilityLabel="电脑配对链接" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} multiline placeholder="aimotion://pair?..." placeholderTextColor="#7B8C98" style={styles.input}/>
    <Button title="连接并同步记录" onPress={() => { void (async () => { try {
      setError('');
      if (Platform.OS === 'android' && Number(Platform.Version) >= 37) {
        const permission = 'android.permission.ACCESS_LOCAL_NETWORK' as Parameters<typeof PermissionsAndroid.request>[0];
        const granted = await PermissionsAndroid.request(permission, { title: '连接电脑工作台', message: '需要访问本地网络，将训练统计同步到同一 Wi-Fi 下的电脑。不会上传相机画面。', buttonPositive: '继续', buttonNegative: '取消' });
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('未获得本地网络权限，可在系统设置中允许后重试。');
      }
      trainingSync.connect(link);
    } catch (e) { setError(e instanceof Error ? e.message : '连接失败，请检查配对链接'); } })(); }}/>
    <Button title="断开连接" secondary onPress={() => trainingSync.disconnect()}/>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{status.message}</Text>{!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={styles.note}>仅在可信私人网络连接。当前局域网同步未加密，不传输相机画面。重启电脑端后需重新配对。</Text>
    <View style={styles.history}><Text style={styles.label}>手机本地训练记录</Text><Text style={styles.text}>有 {count} 条等待同步。模拟记录始终标注来源，不计算热量。</Text>{records.map(record => <View key={record.sessionId} style={styles.row}><Text style={styles.label}>{record.activity} · {record.source === 'simulation' ? '模拟' : '实际输入'}</Text><Text style={styles.note}>{new Date(record.startedAt).toLocaleString()}　{(record.activeMs / 1000).toFixed(0)} 秒，{record.reps} 次命中</Text><Text style={styles.note}>{record.phase === 'finished' ? '已结束' : '阶段记录'}</Text></View>)}{!records.length && <Text style={styles.note}>完成一轮模拟体验后，记录会保存在这里。关闭应用后仍会保留。</Text>}</View>
  </ScrollView></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background, paddingTop: StatusBar.currentHeight ?? 0 }, content: { padding: 24, gap: 16, paddingBottom: 48, width: '100%', maxWidth: 560, alignSelf: 'center' }, title: { fontSize: 28, fontWeight: '600', color: '#20364A' }, text: { color: '#526677', lineHeight: 24, fontSize: 14 }, label: { color: '#20364A', fontSize: 15, fontWeight: '500' }, input: { borderWidth: 1, borderColor: '#B8CBD7', borderRadius: 6, padding: 12, minHeight: 100, color: '#20364A', textAlignVertical: 'top', backgroundColor: '#FFFFFF' }, note: { color: '#647786', lineHeight: 22, fontSize: 12 }, error: { color: '#A83C49', lineHeight: 22 }, history: { marginTop: 12, borderTopWidth: 1, borderColor: '#CFDCE4', paddingTop: 24, gap: 12 }, row: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#DCE5EB', gap: 8 } });
