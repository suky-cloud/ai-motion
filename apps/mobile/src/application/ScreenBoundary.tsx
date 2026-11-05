import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Remounted with each route identity so recovery can reopen the failed screen. */
export default class ScreenBoundary extends React.Component<{
  children: React.ReactNode; onRecover: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.warn('[AI Motion] screen failed'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <View style={styles.page}>
      <Text style={styles.title}>这个页面暂时没能打开</Text>
      <Text style={styles.description}>返回首页后，可以重新进入。未完成的这一轮不会计入结果。</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={this.props.onRecover}>
        <Text style={styles.buttonText}>返回首页</Text>
      </Pressable>
    </View>;
  }
}
const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', gap: 20, backgroundColor: '#F3F6F8', padding: 28 },
  title: { color: '#20364A', fontSize: 23, fontWeight: '600' },
  description: { color: '#526677', fontSize: 15, lineHeight: 24 },
  button: { backgroundColor: '#285F85', borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
