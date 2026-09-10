import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  DatePicker,
  EmptyState,
  Hero,
  Icon,
  Screen,
  ScreenHeader,
  StatusPill,
  SyncStatusBadge,
  type IconName,
} from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { listEarlyLeavesToday } from '@/features/earlyLeave/api';
import { enqueueOperation } from '@/lib/offline/queue';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { amendStudentAttendanceBulk, closeClassAttendanceDay, fetchRosterForCaching, reopenClassAttendanceDay } from './api';
import { deviceId } from './init';
import { cacheRoster, getCachedRoster, type CachedRosterStudent } from './rosterCache';
import type { AttendanceEntry } from './schema';
import { StatusToggle } from './StatusToggle';
import {
  todayIso,
  useAttendanceEditable,
  useClassAttendanceReopen,
  useClassName,
  useExistingSubmission,
  useIsSchoolDay,
  useStudentAttendanceForDate,
} from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'MarkAttendance'>;

type MarkState = Record<string, { status: AttendanceEntry['status']; reason?: string }>;

export function MarkAttendanceScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const classId = params.classId;
  const today = todayIso();
  const queryClient = useQueryClient();
  const className = useClassName(classId);

  const [onDate, setOnDate] = useState(today);
  const isPrincipal = useIsPrincipal();
  const schoolDay = useIsSchoolDay(onDate);
  const editable = useAttendanceEditable(classId, onDate);
  const canEdit = editable.data ?? true;
  // Always enabled, not just while locked — once a principal reopens a
  // date, canEdit flips true and we still need this to know a reopen is
  // active so the lock bubble can be tapped again to close it.
  const reopen = useClassAttendanceReopen(classId, onDate, true);
  const [reopening, setReopening] = useState(false);

  const existingSubmission = useExistingSubmission(classId, onDate);
  const existingAttendance = useStudentAttendanceForDate(classId, onDate);

  const [roster, setRoster] = useState<CachedRosterStudent[] | null>(null);
  const rosterStudentIds = useMemo(() => (roster ?? []).map((s) => s.id), [roster]);
  // Only meaningful once there's a submission to summarize — the roster's own
  // marking pass never records early leaves itself.
  const earlyLeaves = useQuery({
    queryKey: ['early-leaves', 'today', classId, onDate],
    queryFn: () => listEarlyLeavesToday(rosterStudentIds, onDate),
    enabled: existingSubmission.data != null && rosterStudentIds.length > 0,
  });
  const earlyLeaveCount = earlyLeaves.data?.length ?? 0;
  const [marks, setMarks] = useState<MarkState>({});
  const [submitting, setSubmitting] = useState(false);

  // Cache-first: the marking screen must open offline (section 9, rule 4).
  // Show whatever's cached instantly, then refresh from the network if
  // available and re-cache for next time. The roster itself doesn't depend
  // on onDate — only the marks do.
  useEffect(() => {
    let cancelled = false;

    getCachedRoster(classId).then((cached) => {
      if (!cancelled && cached.length > 0) setRoster(cached);
    });

    fetchRosterForCaching(classId)
      .then(async (fresh) => {
        if (cancelled || fresh.length === 0) return;
        await cacheRoster(classId, fresh);
        setRoster(fresh);
      })
      .catch(() => {
        // Offline or RLS-denied — the cached roster (if any) already covers this.
      });

    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Overrides are student-id keyed only, not date-keyed — clear them
  // whenever the selected date changes so a status picked for one day
  // never leaks onto another.
  function changeDate(next: string) {
    setOnDate(next);
    setMarks({});
  }

  const setStatus = useCallback((studentId: string, status: AttendanceEntry['status']) => {
    setMarks((prev) => ({ ...prev, [studentId]: { ...prev[studentId], status } }));
  }, []);

  // What's actually recorded for onDate (empty for a date nothing's been
  // submitted for yet) is the baseline; an explicit toggle overrides it.
  const statusFor = useCallback(
    (studentId: string): AttendanceEntry['status'] => marks[studentId]?.status ?? existingAttendance.data?.[studentId]?.status ?? 'present',
    [marks, existingAttendance.data],
  );

  const absentCount = useMemo(() => (roster ?? []).filter((s) => statusFor(s.id) === 'absent').length, [roster, statusFor]);
  const lateCount = useMemo(() => (roster ?? []).filter((s) => statusFor(s.id) === 'late').length, [roster, statusFor]);
  const presentCount = (roster?.length ?? 0) - absentCount - lateCount;

  function confirmReopen() {
    Alert.alert(
      'Reopen this date?',
      `${format(parseISO(onDate), 'EEEE, d MMMM yyyy')} will become editable for this class until it's locked again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => void doReopen() },
      ],
    );
  }

  async function doReopen() {
    setReopening(true);
    try {
      await reopenClassAttendanceDay(classId, onDate);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'editable', classId, onDate] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'class-reopen', classId, onDate] }),
      ]);
    } catch {
      Alert.alert('Could not reopen this date', 'You may not have permission — only a principal can reopen a locked date.');
    } finally {
      setReopening(false);
    }
  }

  function confirmClose() {
    Alert.alert('Lock this date again?', `${format(parseISO(onDate), 'EEEE, d MMMM yyyy')} will go back to principal-only editing.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: () => void doClose() },
    ]);
  }

  async function doClose() {
    setReopening(true);
    try {
      await closeClassAttendanceDay(classId, onDate);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'editable', classId, onDate] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'class-reopen', classId, onDate] }),
      ]);
    } catch {
      Alert.alert('Could not lock this date', 'Something went wrong — try again.');
    } finally {
      setReopening(false);
    }
  }

  function confirmSubmit() {
    if (!roster || roster.length === 0 || submitting || !canEdit) return;
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
    if (!roster || roster.length === 0 || submitting || !canEdit) return;
    setSubmitting(true);

    const localAbsentees = roster
      .filter((s) => statusFor(s.id) === 'absent')
      .map((s) => ({ studentId: s.id, fullName: s.preferredName || s.fullName }));

    try {
      if (existingSubmission.data) {
        // Editing a date that's already been submitted (reopened, or today
        // still within its edit window) is a separate, always-online action
        // — submit_attendance() is create-only and would reject this as
        // 'already_submitted' (see amendStudentAttendanceBulk).
        await amendStudentAttendanceBulk(
          classId,
          onDate,
          roster.map((s) => ({ studentId: s.id, status: statusFor(s.id), reason: marks[s.id]?.reason })),
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['attendance', 'submission', classId, onDate] }),
          queryClient.invalidateQueries({ queryKey: ['attendance', 'existing-for-date', classId, onDate] }),
          // A reopened past date locks itself back the moment this resubmit
          // succeeds (amend_student_attendance_bulk consumes the reopen
          // server-side) — refresh both so a still-mounted DateStrip/lock
          // indicator reflects that immediately instead of showing stale
          // "reopened, editable" state.
          queryClient.invalidateQueries({ queryKey: ['attendance', 'editable', classId, onDate] }),
          queryClient.invalidateQueries({ queryKey: ['attendance', 'class-reopen', classId, onDate] }),
        ]);
      } else {
        const entries: AttendanceEntry[] = roster.map((s) => ({
          student_id: s.id,
          status: statusFor(s.id),
          reason: marks[s.id]?.reason,
        }));
        await enqueueOperation('submit_attendance', {
          class_id: classId,
          on_date: onDate,
          entries,
          device_id: deviceId(),
        });
      }
      navigation.replace('AttendanceSubmitted', { classId, onDate, localAbsentees });
    } catch {
      Alert.alert('Could not submit attendance', 'Something went wrong — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (roster === null) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title={className.data ? `Attendance · ${className.data}` : 'Attendance'} tone="onPrimary" back={navigation.canGoBack()} hideBell />
          <DateStrip
            onDate={onDate}
            today={today}
            onChange={changeDate}
            canEdit={canEdit}
            editableLoading={editable.isLoading}
            isPrincipal={isPrincipal}
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

  if (roster.length === 0) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title={className.data ? `Attendance · ${className.data}` : 'Attendance'} tone="onPrimary" back={navigation.canGoBack()} hideBell />
          <DateStrip
            onDate={onDate}
            today={today}
            onChange={changeDate}
            canEdit={canEdit}
            editableLoading={editable.isLoading}
            isPrincipal={isPrincipal}
            reopen={reopen.data ?? null}
            reopening={reopening}
            onReopen={confirmReopen}
            onClose={confirmClose}
          />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="No cached roster" message="Connect to the internet once to load this class, then marking works offline." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={className.data ? `Attendance · ${className.data}` : 'Attendance'} tone="onPrimary" back={navigation.canGoBack()} hideBell>
          {existingSubmission.data ? <SyncStatusBadge /> : null}
        </ScreenHeader>
        <DateStrip
          onDate={onDate}
          today={today}
          onChange={changeDate}
          canEdit={canEdit}
          editableLoading={editable.isLoading}
          isPrincipal={isPrincipal}
          reopen={reopen.data ?? null}
          reopening={reopening}
          onReopen={confirmReopen}
          onClose={confirmClose}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {onDate === today ? <StatusPill label="Today" tone="gold" /> : null}
          <SchoolDayPill schoolDay={schoolDay.data} loading={schoolDay.isLoading} />
          <SubmissionStatusPill loading={existingSubmission.isLoading} submitted={existingSubmission.data != null} />
        </View>
      </Hero>

      <FadeInBody>
        <FlatList
          data={roster}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs, paddingBottom: 140 }}
          ListHeaderComponent={
            existingSubmission.data ? (
              <View style={{ paddingBottom: spacing.md }}>
                <SummaryStats
                  present={presentCount}
                  earlyLeaveCount={earlyLeaveCount}
                  absent={absentCount}
                  onPressEarlyLeave={() => navigation.navigate('EarlyLeave', { classId, onDate })}
                  onPressAbsent={() => navigation.navigate('AttendanceSubmitted', { classId, onDate })}
                />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const baseline = existingAttendance.data?.[item.id]?.status ?? 'present';
            const pending = statusFor(item.id);
            const edited = marks[item.id] !== undefined && pending !== baseline;
            return (
              <Card style={styles.row}>
                <View>
                  <Avatar name={item.preferredName || item.fullName} size={34} />
                  {edited ? <View style={styles.editedDot} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.body, fontSize: 14, color: semantic.textPrimary }}>
                    {item.preferredName || item.fullName}
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>#{index + 1}</Text>
                </View>
                <StatusToggle value={pending} onChange={(status) => setStatus(item.id, status)} disabled={!canEdit} hideLate />
              </Card>
            );
          }}
        />
      </FadeInBody>

      <View style={styles.footer}>
        {canEdit && absentCount ? (
          <Text style={styles.footerCaption}>
            {absentCount} absent · {presentCount} present
          </Text>
        ) : null}
        <Button
          label={
            canEdit
              ? existingSubmission.data
                ? 'Save changes'
                : 'Submit attendance'
              : isPrincipal
                ? 'Locked — reopen this date to submit'
                : 'Locked — ask a principal to reopen this date'
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

/**
 * Present/early-leave/absent breakdown for whatever's currently pending —
 * recorded status for anything untouched, live toggles for anything just
 * edited. Early leave and absent double as shortcuts into the screens that
 * hold their detail (this screen has no "late" mark for students — see
 * StatusToggle's hideLate — so that slot is early leave instead).
 */
function SummaryStats({
  present,
  earlyLeaveCount,
  absent,
  onPressEarlyLeave,
  onPressAbsent,
}: {
  present: number;
  earlyLeaveCount: number;
  absent: number;
  onPressEarlyLeave: () => void;
  onPressAbsent: () => void;
}) {
  return (
    <Card style={{ flexDirection: 'row' }}>
      <StatColumn label="Present" value={present} color={colors.success} bg={colors.successBg} icon="checkmark-circle" />
      <StatColumn
        label="Early leave"
        value={earlyLeaveCount}
        color={colors.info}
        bg={colors.infoBg}
        icon="exit-outline"
        onPress={onPressEarlyLeave}
      />
      <StatColumn label="Absent" value={absent} color={colors.error} bg={colors.errorBg} icon="close-circle" onPress={onPressAbsent} />
    </Card>
  );
}

function StatColumn({
  label,
  value,
  color,
  bg,
  icon,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: IconName;
  onPress?: () => void;
}) {
  if (!onPress) {
    return (
      <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}`}>
        <View style={[styles.statBadge, { backgroundColor: bg }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <Text style={[typography.title, styles.statValue, { color }]}>{value}</Text>
        <View style={styles.statLabelRow}>
          <Text style={[typography.caption, styles.statLabel, { color: semantic.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
          <View style={{ width: 12 }} />
        </View>
      </View>
    );
  }

  // Pressable stats get their own tinted, bordered tile (badge flips to a
  // white circle to pop against it) plus a trailing chevron next to the
  // label — the same "tappable row" language as Card's onPress rows and
  // AttendanceSubmitted's view chevrons, so it reads as a button at a
  // glance instead of a plain stat like Present.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to view details.`}
      onPress={onPress}
      style={({ pressed }) => [styles.statTile, { backgroundColor: bg }, pressed && styles.statColumnPressed]}
    >
      <View style={[styles.statBadge, { backgroundColor: semantic.surface }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={[typography.title, styles.statValue, { color }]}>{value}</Text>
      <View style={styles.statLabelRow}>
        <Text style={[typography.captionStrong, styles.statLabel, { color }]} numberOfLines={1} ellipsizeMode="tail">
          {label}
        </Text>
        <Icon name="chevron-forward" size={12} color={color} />
      </View>
    </Pressable>
  );
}

function SchoolDayPill({ schoolDay, loading }: { schoolDay: boolean | undefined; loading: boolean }) {
  if (loading) return null;
  return <StatusPill label={schoolDay ? 'School day' : 'Not a school day'} tone={schoolDay ? 'success' : 'neutral'} />;
}

/** Class sibling of MarkStaffAttendanceScreen's MarkingStatusPill — whether onDate already carries a submission for this class at all. No partial state to speak of (class attendance is submitted all at once, not one self-check-in at a time), so it's a plain two-state pill rather than an "X/Y marked" fraction. */
function SubmissionStatusPill({ loading, submitted }: { loading: boolean; submitted: boolean }) {
  if (loading) return null;
  return <StatusPill label={submitted ? 'Already marked' : 'Not marked yet'} tone={submitted ? 'success' : 'neutral'} />;
}

/**
 * Full sibling of MarkStaffAttendanceScreen's DateStrip: prev/next-day
 * steppers flanking a date-picker chip, plus a lock indicator on the
 * trailing edge. Capped at today — class attendance isn't marked for a
 * future date. Unlike staff attendance's single global lock, this locks
 * per (class, date): a past date, or today once its own edit window has
 * closed, needs a student_attendance_reopens row (attendance.reopen_class
 * — principal only) before attendance.mark holders can write to it again.
 */
function DateStrip({
  onDate,
  today,
  onChange,
  canEdit,
  editableLoading,
  isPrincipal,
  reopen,
  reopening,
  onReopen,
  onClose,
}: {
  onDate: string;
  today: string;
  onChange: (isoDate: string) => void;
  canEdit: boolean;
  editableLoading: boolean;
  isPrincipal: boolean;
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
      <LockIndicator canEdit={canEdit} loading={editableLoading} isPrincipal={isPrincipal} reopen={reopen} reopening={reopening} onReopen={onReopen} onClose={onClose} />
    </View>
  );
}

/**
 * Open padlock while this class/date is still editable — either it's not
 * locked at all (today, within its edit window), or it's locked but a
 * student_attendance_reopens row exists for it. Closed padlock once
 * locked with no reopen row. A principal can tap it once it's locked
 * either way — closed calls onReopen (confirmed first), reopened calls
 * onClose to lock it again (also confirmed first).
 */
function LockIndicator({
  canEdit,
  loading,
  isPrincipal,
  reopen,
  reopening,
  onReopen,
  onClose,
}: {
  canEdit: boolean;
  loading: boolean;
  isPrincipal: boolean;
  reopen: { reopenedByName: string; reopenedAt: string } | null;
  reopening: boolean;
  onReopen: () => void;
  onClose: () => void;
}) {
  const icon: IconName = canEdit ? 'lock-open-outline' : 'lock-closed-outline';
  // Tappable whenever there's something for a principal to toggle either
  // direction: locked (offer reopen), or currently reopened (offer close)
  // even if it's otherwise naturally editable right now.
  const actionable = isPrincipal && (!canEdit || reopen != null);
  const label = loading
    ? 'Checking whether this date is editable'
    : canEdit
      ? reopen
        ? isPrincipal
          ? `Reopened by ${reopen.reopenedByName} — tap to lock again`
          : `Reopened by ${reopen.reopenedByName}, editable`
        : 'This date is editable until its edit window closes'
      : isPrincipal
        ? 'Locked — tap to reopen this date'
        : 'Locked — ask a principal to reopen this date';

  const content = loading || reopening ? (
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
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={reopening} onPress={reopen ? onClose : onReopen}>
      {bubble}
    </Pressable>
  );
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
    alignSelf: 'center',
  },
  // No alignItems here (defaults to 'stretch') so every child spans the
  // tile's full, equally-flexed width instead of hugging its own content —
  // that's what actually keeps "Early leave" from claiming extra width next
  // to the shorter "Present"/"Absent" labels. minWidth: 0 is the other half
  // of that: without it Yoga still reserves each item's content-width as a
  // floor and flex:1 alone can't shrink it past that.
  statTile: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  statValue: { textAlign: 'center' },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  statLabel: { flexShrink: 1 },
  statColumnPressed: { opacity: 0.6 },
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
