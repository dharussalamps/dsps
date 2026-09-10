import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, minTapTarget, radius, spacing, typography } from '@/theme/tokens';
import type { AttendanceEntry } from './schema';

type Status = AttendanceEntry['status'];

const OPTIONS: { status: Status; label: string; color: string }[] = [
  { status: 'present', label: 'P', color: colors.success },
  { status: 'late', label: 'L', color: colors.warning },
  { status: 'absent', label: 'A', color: colors.error },
];

type Props = {
  value: Status;
  onChange: (status: Status) => void;
  /** Read-only, e.g. a locked past date on MarkStaffAttendanceScreen — shows the current value but ignores taps. */
  disabled?: boolean;
};

/**
 * Three-way present/late/absent selector, sized for a fast thumb tap across
 * ~35 rows. The selected option fills solid with its status color and turns
 * its label white — a pale tint (the previous version, activeBg/activeFg
 * from the *Bg tokens) sat too close in lightness to the unselected cream
 * background to tell apart at a glance, especially warningBg vs cream100.
 */
export function StatusToggle({ value, onChange, disabled }: Props) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {OPTIONS.map((opt) => {
        const active = value === opt.status;
        return (
          <Pressable
            key={opt.status}
            accessibilityRole="button"
            accessibilityLabel={opt.status}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(opt.status)}
            style={[styles.button, active && { backgroundColor: opt.color, borderColor: opt.color }]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  rowDisabled: { opacity: 0.5 },
  button: {
    width: minTapTarget,
    height: minTapTarget,
    borderRadius: radius.md,
    backgroundColor: colors.cream50,
    borderWidth: 1.5,
    borderColor: colors.cream200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.bodyStrong, color: colors.ink500 },
  labelActive: { color: colors.white, fontWeight: '800' },
});
