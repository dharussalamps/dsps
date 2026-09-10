import { format, parseISO } from 'date-fns';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, SectionHeader } from '@/components';
import { useStudentAttendanceSummary } from '@/features/attendance/hooks';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = { studentId: string };

function rateColor(rate: number): string {
  return rate >= 90 ? colors.success : rate >= 75 ? colors.warning : colors.error;
}

/** Rolled-up attendance report for the profile's Attendance tab: a headline rate for the current academic year to date, present/absent counts (late counts as present), and a per-month trend bar chart. */
export function AttendanceAnalysisCard({ studentId }: Props) {
  const summary = useStudentAttendanceSummary(studentId);

  if (summary.isLoading) {
    return (
      <Card>
        <SectionHeader icon="bar-chart-outline" label="ATTENDANCE ANALYSIS" />
        <ActivityIndicator color={semantic.primary} style={{ marginVertical: spacing.md }} />
      </Card>
    );
  }

  const data = summary.data;
  if (!data || data.totalDays === 0) {
    return (
      <Card>
        <SectionHeader icon="bar-chart-outline" label="ATTENDANCE ANALYSIS" />
        <EmptyState title="No attendance recorded yet" message="A report appears here once school days have been marked." />
      </Card>
    );
  }

  const attendedRate = Math.round((data.presentCount / data.totalDays) * 100);

  return (
    <Card>
      <SectionHeader icon="bar-chart-outline" label="ATTENDANCE ANALYSIS" />

      <View style={styles.rateBlock}>
        <View style={{ gap: 2 }}>
          <Text style={styles.rateLabel}>Attendance rate</Text>
          <Text style={styles.rateValue}>{attendedRate}%</Text>
        </View>
        <Text style={styles.rateSub}>{data.totalDays} school {data.totalDays === 1 ? 'day' : 'days'}{'\n'}this year</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StatChip label="Present" value={data.presentCount} color={colors.success} bg={colors.successBg} />
        <StatChip label="Absent" value={data.absentCount} color={colors.error} bg={colors.errorBg} />
      </View>

      {data.months.length > 1 ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 }}>MONTHLY TREND</Text>
          <View style={styles.chartRow}>
            {data.months.map((m) => {
              const rate = m.total > 0 ? Math.round((m.presentCount / m.total) * 100) : 0;
              return (
                <View key={m.month} style={styles.chartCol}>
                  <View style={styles.chartTrack}>
                    <View style={[styles.chartFill, { height: `${Math.max(6, rate)}%`, backgroundColor: rateColor(rate) }]} />
                  </View>
                  <Text style={styles.chartValue}>{rate}%</Text>
                  <Text style={styles.chartLabel} numberOfLines={1}>
                    {format(parseISO(`${m.month}-01`), 'MMM')}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function StatChip({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: bg }]}>
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      <Text style={[styles.statChipLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rateLabel: { ...typography.caption, color: colors.cream100 },
  rateValue: { ...typography.display, color: colors.white },
  rateSub: { ...typography.caption, color: colors.cream100, textAlign: 'right' },
  statChip: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radius.md, paddingVertical: spacing.sm },
  statChipValue: { ...typography.subtitle },
  statChipLabel: { ...typography.caption, fontWeight: '600' },
  chartRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  chartCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  chartTrack: {
    width: 20,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: semantic.surfaceAlt,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartFill: { width: '100%', borderRadius: radius.sm },
  chartValue: { ...typography.captionStrong, color: semantic.textPrimary },
  chartLabel: { ...typography.caption, color: semantic.textSecondary },
});
