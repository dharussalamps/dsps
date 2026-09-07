import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTapTarget, radius, spacing, typography } from '@/theme/tokens';
import type { AttendanceEntry } from './schema';

type Status = AttendanceEntry['status'];

const OPTIONS: { status: Status; label: string; activeBg: string; activeFg: string }[] = [
  { status: 'present', label: 'P', activeBg: colors.successBg, activeFg: colors.success },
  { status: 'late', label: 'L', activeBg: colors.warningBg, activeFg: colors.warning },
  { status: 'absent', label: 'A', activeBg: colors.errorBg, activeFg: colors.error },
];

type Props = {
  value: Status;
  onChange: (status: Status) => void;
};

/** Three-way present/late/absent selector, sized for a fast thumb tap across ~35 rows. */
export function StatusToggle({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt.status;
        return (
          <Pressable
            key={opt.status}
            accessibilityRole="button"
            accessibilityLabel={opt.status}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.status)}
            style={[styles.button, active && { backgroundColor: opt.activeBg }]}
          >
            <Text style={[styles.label, active && { color: opt.activeFg }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  button: {
    width: minTapTarget,
    height: minTapTarget,
    borderRadius: radius.md,
    backgroundColor: colors.cream100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.bodyStrong, color: colors.ink300 },
});
