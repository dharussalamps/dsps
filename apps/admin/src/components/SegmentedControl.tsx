import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTapTarget, radius, semantic, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Option<T extends string> = { key: T; label: string; icon?: IconName };

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
};

/** Icon-over-label tab switcher for use on a colored Hero band (e.g. attendance board, student profile). */
export function SegmentedControl<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            {opt.icon ? <Icon name={opt.icon} size={19} color={active ? semantic.primary : colors.white} /> : null}
            <Text style={[styles.segmentLabel, { color: active ? semantic.primary : colors.white }]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: minTapTarget + 8,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  segmentItemActive: {
    backgroundColor: colors.white,
  },
  segmentLabel: { fontSize: 11, lineHeight: 13, fontWeight: '700' },
});
