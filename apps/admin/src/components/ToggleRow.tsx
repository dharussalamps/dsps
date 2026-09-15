import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import type { WidgetTint } from './WidgetTile';

/** A labelled on/off row, e.g. a settings toggle. Lifted out of SettingsScreen so DashboardWidgetsScreen can reuse the same look. */
export function ToggleRow({
  icon,
  tint,
  label,
  description,
  value,
  busy,
  onToggle,
}: {
  icon?: IconName;
  /** Recolors the icon chip — e.g. to distinguish a widget's category on DashboardWidgetsScreen. Defaults to the standard primary chip. */
  tint?: WidgetTint;
  label: string;
  description?: string;
  value: boolean;
  busy?: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.iconChip, tint ? { backgroundColor: tint.bg } : null]}>
          <Icon name={icon} size={16} color={tint?.fg ?? semantic.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{label}</Text>
        {description ? <Text style={styles.hint}>{description}</Text> : null}
      </View>
      {busy ? <ActivityIndicator color={semantic.primary} /> : <Toggle value={value} onValueChange={onToggle} />}
    </View>
  );
}

export function Toggle({ value, onValueChange }: { value: boolean; onValueChange: () => void }) {
  const [anim] = useState(() => new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.cream200, semantic.primary] });
  const thumbTranslate = anim.interpolate({ inputRange: [0, 1], outputRange: [2, 22] });

  return (
    <Pressable onPress={onValueChange} accessibilityRole="switch" accessibilityState={{ checked: value }} hitSlop={8}>
      <Animated.View style={[styles.toggleTrack, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbTranslate }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  hint: { ...typography.caption, color: semantic.textSecondary },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    shadowColor: colors.ink900,
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
