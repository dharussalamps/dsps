import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, DatePicker, EmptyState, Hero, Icon, Screen, ScreenHeader, StatusPill, type IconName } from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { closeStaffAttendanceDay, markStaffAttendanceBulk, reopenStaffAttendanceDay, type StaffAttendanceRow } from './api';
import { todayIso, useIsSchoolDay, useStaffAttendanceReopen, useStaffAttendanceToday } from './hooks';
import type { AttendanceEntry } from './schema';
import { StatusToggle } from './StatusToggle';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type MarkState = Record<string, AttendanceEntry['status']>;

/** Board rows default to present unless already present/late/absent on the selected date — on_leave and not_checked_in both start as present, an admin overrides from there. */
function defaultStatus(current: string): AttendanceEntry['status'] {
  return current === 'present' || current === 'late' || current === 'absent' ? current : 'present';
}

/** section 15 open decision #1: admin/principal mark every staff member's attendance in one action, mirroring MarkAttendanceScreen's class flow (default present, toggle exceptions, one submit). */
export function MarkStaffAttendanceScreen() {
  const navigation = useNavigation<Nav>();
  const today = todayIso();
  const [onDate, setOnDate] = useState(today);
  const queryClient = useQueryClient();
  const board = useStaffAttendanceToday(onDate);
  const schoolDay = useIsSchoolDay(onDate);

  // Today is always open to anyone with attendance.mark_staff. A past date
  // is locked for *everyone* — principal included — until a
  // staff_attendance_reopens row exists for it; attendance.reopen_staff
  // (principal only) gates *creating* that row, not writing directly —
  // matched server-side by the mark_staff_attendance/_update RLS policies
  // and mark_staff_attendance_bulk() (20260910010000_staff_attendance_
  // reopen_required_for_all.sql). isPrincipal only decides whether this
  // screen offers the reopen button; the backend is the real enforcement.
  const isPastDate = onDate < today;
  const isPrincipal = useIsPrincipal();
  const reopen = useStaffAttendanceReopen(onDate, isPastDate);
  const canEdit = !isPastDate || !!reopen.data;
  const [reopening, setReopening] = useState(false);

  // Only explicit overrides live here — the displayed/submitted value for
  // any staff member not yet touched is derived straight from board.data
  // (defaultStatus), so there's no need to seed this from a query result.
  const [marks, setMarks] = useState<MarkState>({});
  const [submitting, setSubmitting] = useState(false);

  function confirmReopen() {
    Alert.alert(
      'Reopen this date?',
      `${format(parseISO(onDate), 'EEEE, d MMMM yyyy')} will become editable for every admin/principal until it's locked again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => void doReopen() },
      ],
    );
  }

  async function doReopen() {
    setReopening(true);
    try {
      await reopenStaffAttendanceDay(onDate);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'staff-reopen', onDate] });
    } catch {
      Alert.alert('Could not reopen this date', 'Something went wrong — try again.');
    } finally {
      setReopening(false);
    }
  }

  function confirmClose() {
    Alert.alert(
      'Lock this date again?',
      `${format(parseISO(onDate), 'EEEE, d MMMM yyyy')} will go back to principal-only editing.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', style: 'destructive', onPress: () => void doClose() },
      ],
    );
  }

  async function doClose() {
    setReopening(true);
    try {
      await closeStaffAttendanceDay(onDate);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'staff-reopen', onDate] });
    } catch {
      Alert.alert('Could not lock this date', 'Something went wrong — try again.');
    } finally {
      setReopening(false);
    }
  }

  // Overrides are staff-id keyed only, not date-keyed — clear them whenever
  // the selected date changes so a status picked for one day never leaks
  // onto another.
  function changeDate(next: string) {
    setOnDate(next);
    setMarks({});
  }

  const setStatus = (staffId: string, status: AttendanceEntry['status']) => setMarks((prev) => ({ ...prev, [staffId]: status }));

  const absentCount = useMemo(
    () => (board.data ?? []).filter((s) => (marks[s.staffId] ?? defaultStatus(s.status)) === 'absent').length,
    [board.data, marks],
  );
  const lateCount = useMemo(
    () => (board.data ?? []).filter((s) => (marks[s.staffId] ?? defaultStatus(s.status)) === 'late').length,
    [board.data, marks],
  );

  function confirmSubmit() {
    if (!board.data || board.data.length === 0 || submitting || !canEdit) return;
    const presentCount = board.data.length - absentCount - lateCount;
    Alert.alert(
      'Submit attendance?',
      `${format(parseISO(onDate), 'EEEE, d MMMM yyyy')}\n\nPresent: ${presentCount}\nLate: ${lateCount}\nAbsent: ${absentCount}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', onPress: () => void doSubmit() },
      ],
    );
  }

  async function doSubmit() {
    if (!board.data || board.data.length === 0 || submitting || !canEdit) return;
    setSubmitting(true);
    try {
      await markStaffAttendanceBulk(
        onDate,
        board.data.map((s) => ({ staffId: s.staffId, status: marks[s.staffId] ?? defaultStatus(s.status) })),
      );
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'staff-board', onDate] });
      navigation.goBack();
    } catch {
      Alert.alert('Could not mark attendance', 'You may not have permission to mark staff attendance.');
    } finally {
      setSubmitting(false);
    }
  }

  const markedCount = (board.data ?? []).filter((s) => s.status !== 'not_checked_in').length;
  const totalCount = board.data?.length ?? 0;

  if (board.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Staff attendance" tone="onPrimary" back={navigation.canGoBack()} hideBell />
          <DateStrip
            onDate={onDate}
            today={today}
            onChange={changeDate}
            isPastDate={isPastDate}
            isPrincipal={isPrincipal}
            canEdit={canEdit}
            reopen={reopen.data ?? null}
            reopening={reopening}
            onReopen={confirmReopen}
            onClose={confirmClose}
          />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!board.data || board.data.length === 0) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Staff attendance" tone="onPrimary" back={navigation.canGoBack()} hideBell />
          <DateStrip
            onDate={onDate}
            today={today}
            onChange={changeDate}
            isPastDate={isPastDate}
            isPrincipal={isPrincipal}
            canEdit={canEdit}
            reopen={reopen.data ?? null}
            reopening={reopening}
            onReopen={confirmReopen}
            onClose={confirmClose}
          />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="No staff visible" message="You may not have permission to view the staff board." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Staff attendance" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        <DateStrip
          onDate={onDate}
          today={today}
          onChange={changeDate}
          isPastDate={isPastDate}
          isPrincipal={isPrincipal}
          canEdit={canEdit}
          reopen={reopen.data ?? null}
          reopening={reopening}
          onReopen={confirmReopen}
          onClose={confirmClose}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          <SchoolDayPill schoolDay={schoolDay.data} loading={schoolDay.isLoading} />
          <MarkingStatusPill markedCount={markedCount} totalCount={totalCount} />
        </View>
      </Hero>

      <FadeInBody>
        {markedCount > 0 ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
            <SummaryStats data={board.data} />
          </View>
        ) : null}

        <FlatList
          data={board.data}
          keyExtractor={(item) => item.staffId}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs, paddingBottom: 140 }}
          renderItem={({ item }) => {
            const pending = marks[item.staffId] ?? defaultStatus(item.status);
            const edited = marks[item.staffId] !== undefined && marks[item.staffId] !== defaultStatus(item.status);
            return (
              <Card style={styles.row}>
                <View>
                  <Avatar name={item.fullName} size={34} />
                  {edited ? <View style={styles.editedDot} /> : null}
                </View>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }}>{item.fullName}</Text>
                <StatusToggle value={pending} onChange={(status) => setStatus(item.staffId, status)} disabled={!canEdit} />
              </Card>
            );
          }}
        />
      </FadeInBody>

      <View style={styles.footer}>
        {canEdit && (absentCount || lateCount) ? (
          <Text style={styles.footerCaption}>
            {absentCount} absent · {lateCount} late · {board.data.length - absentCount - lateCount} present
          </Text>
        ) : null}
        <Button
          label={
            canEdit ? 'Submit attendance' : isPrincipal ? 'Locked — reopen this date to submit' : 'Locked — ask a principal to reopen this date'
          }
          icon={canEdit ? 'checkmark-done-outline' : 'lock-closed-outline'}
          onPress={confirmSubmit}
          loading={submitting}
          disabled={!canEdit}
        />
      </View>
    </Screen>
  );
}

/** Fades the whole scrollable body in once, on first mount — a light "latest UI" touch that costs nothing (React Native's built-in Animated, no extra dependency). */
function FadeInBody({ children }: { children: ReactNode }) {
  // Animated.Value goes in state, not a ref — its identity must stay stable
  // across renders same as a ref would give, but the lazy useState initializer
  // avoids "accessing .current during render" (react-hooks/refs) that a
  // useRef(...).current read for the same purpose would trip.
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fade in once, not on every re-render.
  }, []);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Present/late/absent breakdown for whatever's already recorded on this date — from board.data's stored status, not the in-progress marks state, so it reflects what was actually submitted rather than unsaved toggles. */
function SummaryStats({ data }: { data: StaffAttendanceRow[] }) {
  const stats: { label: string; value: number; color: string; bg: string; icon: IconName }[] = [
    { label: 'Present', value: data.filter((s) => s.status === 'present').length, color: colors.success, bg: colors.successBg, icon: 'checkmark-circle' },
    { label: 'Late', value: data.filter((s) => s.status === 'late').length, color: colors.warning, bg: colors.warningBg, icon: 'time' },
    { label: 'Absent', value: data.filter((s) => s.status === 'absent').length, color: colors.error, bg: colors.errorBg, icon: 'close-circle' },
  ];

  return (
    <Card style={{ flexDirection: 'row' }}>
      {stats.map((s) => (
        <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: spacing.xs }} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
          <View style={[styles.statBadge, { backgroundColor: s.bg }]}>
            <Icon name={s.icon} size={20} color={s.color} />
          </View>
          <Text style={{ ...typography.title, color: s.color }}>{s.value}</Text>
        </View>
      ))}
    </Card>
  );
}

/**
 * Prev/next-day steppers as circular icon buttons flanking the date-picker
 * chip, plus a lock indicator pinned to the row's right edge (space-between)
 * — every date shows one: today is always an open padlock (never needs
 * reopening), a past date shows closed until a staff_attendance_reopens row
 * exists for it. Everyone sees the state; only a principal can tap it —
 * open to reopen, or closed again to re-lock (attendance.reopen_staff
 * server-side either way; see LockIndicator). Capped at today, since staff
 * attendance isn't marked for a future date.
 */
function DateStrip({
  onDate,
  today,
  onChange,
  isPastDate,
  isPrincipal,
  canEdit,
  reopen,
  reopening,
  onReopen,
  onClose,
}: {
  onDate: string;
  today: string;
  onChange: (isoDate: string) => void;
  isPastDate: boolean;
  isPrincipal: boolean;
  canEdit: boolean;
  reopen: { reopenedByName: string; reopenedAt: string } | null;
  reopening: boolean;
  onReopen: () => void;
  onClose: () => void;
}) {
  const isToday = onDate >= today;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          hitSlop={8}
          onPress={() => onChange(format(addDays(parseISO(onDate), -1), 'yyyy-MM-dd'))}
          style={styles.stepButton}
        >
          <Icon name="chevron-back" size={18} color={colors.white} />
        </Pressable>
        <DatePicker value={onDate} onChange={onChange} maxDate={today} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          hitSlop={8}
          disabled={isToday}
          onPress={() => onChange(format(addDays(parseISO(onDate), 1), 'yyyy-MM-dd'))}
          style={[styles.stepButton, isToday && { opacity: 0.35 }]}
        >
          <Icon name="chevron-forward" size={18} color={colors.white} />
        </Pressable>
      </View>
      <LockIndicator
        isPastDate={isPastDate}
        isPrincipal={isPrincipal}
        canEdit={canEdit}
        reopen={reopen}
        reopening={reopening}
        onReopen={onReopen}
        onClose={onClose}
      />
    </View>
  );
}

/**
 * Open padlock whenever the date is editable (always true for today, or a
 * past date with a staff_attendance_reopens row), closed padlock otherwise.
 * A principal can tap either state on a past date — closed calls onReopen
 * (confirmed first), open calls onClose to lock it again (also confirmed
 * first). Today is never locked, so there's nothing to tap there either way.
 */
function LockIndicator({
  isPastDate,
  isPrincipal,
  canEdit,
  reopen,
  reopening,
  onReopen,
  onClose,
}: {
  isPastDate: boolean;
  isPrincipal: boolean;
  canEdit: boolean;
  reopen: { reopenedByName: string; reopenedAt: string } | null;
  reopening: boolean;
  onReopen: () => void;
  onClose: () => void;
}) {
  const locked = !canEdit;
  const icon: IconName = locked ? 'lock-closed-outline' : 'lock-open-outline';
  const actionable = isPastDate && isPrincipal;
  const label = !isPastDate
    ? "Today's attendance is always editable"
    : locked
      ? isPrincipal
        ? 'Locked — tap to reopen this date'
        : 'Locked — ask a principal to reopen this date'
      : isPrincipal
        ? `Reopened by ${reopen?.reopenedByName ?? 'a principal'} — tap to lock again`
        : `Reopened by ${reopen?.reopenedByName ?? 'a principal'}, editable`;

  const content = reopening ? (
    <ActivityIndicator size="small" color={colors.white} />
  ) : (
    <Icon name={icon} size={16} color={actionable ? colors.gold500 : colors.white} />
  );

  const bubble = <View style={[styles.stepButton, actionable && styles.lockBubbleActionable]}>{content}</View>;

  if (!actionable) {
    return (
      <View accessible accessibilityLabel={label}>
        {bubble}
      </View>
    );
  }

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={reopening} onPress={locked ? onReopen : onClose}>
      {bubble}
    </Pressable>
  );
}

function SchoolDayPill({ schoolDay, loading }: { schoolDay: boolean | undefined; loading: boolean }) {
  if (loading) return null;
  return <StatusPill label={schoolDay ? 'School day' : 'Not a school day'} tone={schoolDay ? 'success' : 'neutral'} />;
}

/** Whether this date already has attendance recorded — no self check-in for now (admin/principal mark everyone in bulk), so a live "X% marked" reads oddly; a plain status pill instead, same as the board's own per-class marking-status language. */
function MarkingStatusPill({ markedCount, totalCount }: { markedCount: number; totalCount: number }) {
  if (totalCount === 0) return null;
  const { label, tone } = markingStatusFor(markedCount, totalCount);
  return <StatusPill label={label} tone={tone} />;
}

function markingStatusFor(markedCount: number, totalCount: number): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  if (markedCount === 0) return { label: 'Not marked yet', tone: 'neutral' };
  if (markedCount === totalCount) return { label: 'Already marked', tone: 'success' };
  return { label: `${markedCount}/${totalCount} marked`, tone: 'warning' };
}

const styles = StyleSheet.create({
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  lockBubbleActionable: { backgroundColor: 'rgba(255,255,255,0.24)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  statBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editedDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.gold500,
    borderWidth: 2,
    borderColor: semantic.surface,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...elevation.raised,
  },
  footerCaption: { ...typography.caption, color: semantic.textSecondary, textAlign: 'center', marginBottom: spacing.sm },
});
