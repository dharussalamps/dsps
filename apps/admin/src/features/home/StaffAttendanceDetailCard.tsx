import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { StaffAttendanceRow } from '@/features/attendance/api';
import { colors, semantic, spacing, typography } from '@/theme/tokens';

const TINT = { fg: colors.info, bg: colors.infoBg };
const DOT: Record<StaffAttendanceRow['status'], string> = {
  present: colors.success,
  late: colors.warning,
  on_leave: colors.ink300,
  absent: colors.error,
  not_checked_in: colors.ink300,
};

/** Home "Staff attendance detail" widget — School Pulse's ratio, expanded into a peek at the actual list. Only rendered when there's at least one row. */
export function StaffAttendanceDetailCard({ staff }: { staff: StaffAttendanceRow[] }) {
  const absentOrLate = staff.filter((s) => s.status !== 'present').slice(0, 2);
  const shown = absentOrLate.length > 0 ? absentOrLate : staff.slice(0, 2);

  return (
    <WidgetTile
      icon="people-outline"
      label="STAFF ATTENDANCE"
      tint={TINT}
      accessory={<Text style={{ ...typography.captionStrong, color: semantic.textPrimary }}>{staff.filter((s) => s.status === 'present' || s.status === 'late').length}/{staff.length}</Text>}
    >
      {shown.map((s) => (
        <View key={s.staffId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: DOT[s.status] }} />
          <Text style={{ ...typography.caption, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {s.fullName}
          </Text>
        </View>
      ))}
    </WidgetTile>
  );
}
