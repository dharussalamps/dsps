import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, Icon, Screen, ScreenHeader, StatusPill } from '@/components';
import type { IconName } from '@/components';
import type { MarkingStatusRow, StaffAttendanceRow } from './api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { remindUnmarkedClass, remindUnmarkedClassesBulk } from './api';
import { todayIso, useMarkingStatus, useStaffAttendanceToday } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'students' | 'staff';

const staffStatusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  on_leave: 'neutral',
  absent: 'error',
  not_checked_in: 'neutral',
};
const staffStatusLabel: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  on_leave: 'On leave',
  absent: 'Absent',
  not_checked_in: 'Not checked in',
};

export function AttendanceBoardScreen() {
  const navigation = useNavigation<Nav>();
  const onDate = todayIso();
  const [tab, setTab] = useState<Tab>('students');

  const status = useMarkingStatus(onDate);
  const staff = useStaffAttendanceToday(onDate);

  const classRows = status.data ?? [];
  const markedCount = classRows.filter((c) => c.submitted).length;
  const absentToday = classRows.reduce((sum, c) => sum + c.absentCount, 0);

  const staffRows = staff.data ?? [];
  const presentCount = staffRows.filter((s) => s.status === 'present' || s.status === 'late').length;
  const absentStaffCount = staffRows.filter((s) => s.status === 'absent').length;
  const onLeaveCount = staffRows.filter((s) => s.status === 'on_leave').length;

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Attendance board" subtitle={format(parseISO(onDate), 'EEEE, d MMMM')} tone="onPrimary" />

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'students', label: 'Classes', icon: 'school-outline' },
            { key: 'staff', label: 'Staff', icon: 'people-outline' },
          ]}
        />

        <View style={styles.chipRow}>
          {tab === 'students' ? (
            status.isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <View style={styles.chipSlot}>
                  <StatChip icon="checkmark-done-outline" value={`${markedCount}/${classRows.length}`} label="Submitted" tone="success" />
                </View>
                <View style={styles.chipSlot}>
                  <StatChip icon="alert-circle-outline" value={String(absentToday)} label="Absent today" tone="error" />
                </View>
              </>
            )
          ) : staff.isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <View style={styles.chipSlot}>
                <StatChip value={String(presentCount)} label="Present" tone="success" />
              </View>
              <View style={styles.chipSlot}>
                <StatChip value={String(absentStaffCount)} label="Absent" tone="error" />
              </View>
              <View style={styles.chipSlot}>
                <StatChip value={String(onLeaveCount)} label="On leave" tone="warning" />
              </View>
            </>
          )}
        </View>
      </Hero>

      {tab === 'students' ? (
        <ClassBoard
          rows={classRows}
          loading={status.isLoading}
          onOpenClass={(classId) => navigation.navigate('MarkAttendance', { classId })}
        />
      ) : (
        <StaffBoard rows={staffRows} loading={staff.isLoading} />
      )}
    </Screen>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { key: T; label: string; icon: IconName }[];
}) {
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
            <Icon name={opt.icon} size={16} color={active ? semantic.primary : colors.white} />
            <Text style={[styles.segmentLabel, { color: active ? semantic.primary : colors.white }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const chipTones = {
  neutral: { bg: 'rgba(255,255,255,0.14)', border: 'rgba(255,255,255,0.3)', fg: colors.white, sub: colors.cream100 },
  success: { bg: 'rgba(20,107,68,0.32)', border: 'rgba(228,245,236,0.4)', fg: colors.white, sub: colors.successBg },
  warning: { bg: 'rgba(169,130,60,0.32)', border: 'rgba(243,230,200,0.4)', fg: colors.white, sub: colors.gold100 },
  error: { bg: 'rgba(194,43,43,0.32)', border: 'rgba(251,231,231,0.4)', fg: colors.white, sub: colors.errorBg },
} as const;

function StatChip({
  icon,
  value,
  label,
  tone = 'neutral',
}: {
  icon?: IconName;
  value: string;
  label: string;
  tone?: keyof typeof chipTones;
}) {
  const t = chipTones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      {icon ? (
        <View style={[styles.chipIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Icon name={icon} size={14} color={t.fg} />
        </View>
      ) : null}
      <View style={styles.chipText}>
        <Text style={[styles.chipValue, { color: t.fg }]} numberOfLines={1} ellipsizeMode="tail">
          {value}
        </Text>
        <Text style={[styles.chipLabel, { color: t.sub }]} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
      </View>
    </View>
  );
}

function ClassBoard({
  rows,
  loading,
  onOpenClass,
}: {
  rows: MarkingStatusRow[];
  loading: boolean;
  onOpenClass: (classId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reminding, setReminding] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [remindError, setRemindError] = useState<string | null>(null);
  const onDate = todayIso();

  const unmarkedCount = rows.filter((c) => !c.submitted).length;

  async function remind(classId: string) {
    setReminding(classId);
    setRemindError(null);
    try {
      await remindUnmarkedClass(classId);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      setRemindError(
        message.includes('rate_limited')
          ? 'Already reminded recently — try again in a couple of minutes.'
          : "Couldn't send the reminder.",
      );
    } finally {
      setReminding(null);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  /** FR-ATT-12: reminds every unmarked class in scope in one action. */
  async function remindAll() {
    setRemindingAll(true);
    setRemindError(null);
    try {
      const count = await remindUnmarkedClassesBulk(onDate);
      setRemindError(count > 0 ? `Reminded ${count} ${count === 1 ? 'class' : 'classes'}.` : 'Nothing to remind right now.');
    } catch {
      setRemindError("Couldn't send reminders.");
    } finally {
      setRemindingAll(false);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  if (loading) return <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.classId}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
      ListHeaderComponent={
        unmarkedCount > 1 || remindError ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {unmarkedCount > 1 ? (
              <Button
                label={`Remind ${unmarkedCount} unmarked classes`}
                icon="megaphone-outline"
                variant="outline"
                loading={remindingAll}
                onPress={() => void remindAll()}
              />
            ) : null}
            {remindError ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{remindError}</Text> : null}
          </View>
        ) : null
      }
      ListEmptyComponent={<EmptyState title="No classes in scope" />}
      renderItem={({ item }) => (
        <Card onPress={() => onOpenClass(item.classId)} flat style={styles.classCard}>
          <View style={[styles.gradeBadge, { backgroundColor: item.submitted ? colors.successBg : colors.errorBg }]}>
            <Text style={[styles.gradeBadgeText, { color: item.submitted ? colors.success : colors.error }]}>{item.gradeNumber}</Text>
          </View>
          <View style={{ gap: 1, flex: 1 }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }} numberOfLines={1}>
              {item.className}
            </Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
              {item.teacherName ?? 'No teacher assigned'}
            </Text>
          </View>
          {item.submitted ? (
            <View style={styles.classCardAction}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <StatusPill
                label={item.absentCount > 0 ? `${item.absentCount} absent` : 'All present'}
                tone={item.absentCount > 0 ? 'warning' : 'success'}
              />
              <Icon name="chevron-forward" size={16} color={semantic.textSecondary} />
            </View>
          ) : (
            <View style={styles.classCardAction}>
              <Icon name="alert-circle" size={18} color={colors.error} />
              <Button
                label="Remind"
                size="sm"
                variant="outline"
                loading={reminding === item.classId}
                onPress={() => void remind(item.classId)}
              />
            </View>
          )}
        </Card>
      )}
    />
  );
}

function StaffBoard({ rows, loading }: { rows: StaffAttendanceRow[]; loading: boolean }) {
  if (loading) return <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />;

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => item.staffId}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs, paddingTop: spacing.lg, paddingBottom: spacing.xl }}
      ListEmptyComponent={<EmptyState title="No staff visible" message="You may only see your own attendance." />}
      renderItem={({ item }) => (
        <Card flat style={styles.staffCard}>
          <Avatar name={item.fullName} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{item.fullName}</Text>
            {item.affectedClass ? (
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                {item.affectedClass.className} · {item.affectedClass.marked ? 'attendance marked' : 'attendance not yet marked'}
              </Text>
            ) : null}
          </View>
          <StatusPill label={staffStatusLabel[item.status]} tone={staffStatusTone[item.status]} />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: minTapTarget,
    borderRadius: radius.pill,
  },
  segmentItemActive: {
    backgroundColor: colors.white,
  },
  segmentLabel: { ...typography.bodyStrong },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chipSlot: { flex: 1, minWidth: 0 },
  chip: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { flexShrink: 1, alignItems: 'center' },
  chipIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipValue: { ...typography.bodyStrong, textAlign: 'center' },
  chipLabel: { ...typography.caption, textAlign: 'center' },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  classCardAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gradeBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadgeText: { ...typography.captionStrong },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
