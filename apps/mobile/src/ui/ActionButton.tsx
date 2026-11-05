import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from './theme';

export default function ActionButton({ title, onPress, secondary = false, disabled = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dimmed]}>
    <Text style={secondary ? styles.secondaryText : styles.text}>{title}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { flexGrow: 1, minHeight: 52, borderRadius: theme.radius.button, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 },
  secondary: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: '#BDCED9' },
  text: { color: theme.colors.surface, fontSize: 15, fontWeight: '600' },
  secondaryText: { color: theme.colors.primary, fontSize: 15, fontWeight: '600' },
  dimmed: { opacity: 0.65 },
});
