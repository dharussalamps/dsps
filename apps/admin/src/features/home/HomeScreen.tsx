import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, StatusPill, TextField } from '@/components';
import { fetchStudentsAtRisk } from '@/features/analytics/api';
import { remindUnmarkedClassesBulk } from '@/features/attendance/api';
import { todayIso, useMarkingStatus, useStaffAttendanceToday } from '@/features/attendance/hooks';
import { declareClosure } from '@/features/calendar/api';
import { listEventsInMonth } from '@/features/events/api';
import { listInventoryItems } from '@/features/inventory/api';
import { usePendingLeaveRequests } from '@/features/leave/hooks';
import { useOutstandingMarkSheets } from '@/features/marks/hooks';
import { fetchResponsibilitiesForStaff } from '@/features/staff/api';
import { parseDMY, toDMY } from '@/lib/date';
import { useOpenDrawer } from '@/navigation/DrawerContext';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { AcademicPerformanceCard } from './AcademicPerformanceCard';
import { AnnouncementsFeedCard } from './AnnouncementsFeedCard';
import { AuditActivityCard } from './AuditActivityCard';
import { BirthdaysCard } from './BirthdaysCard';
import { CalendarOverviewCard } from './CalendarOverviewCard';
import { CoverAssignmentsCard } from './CoverAssignmentsCard';
import { EarlyLeaveLogCard } from './EarlyLeaveLogCard';
import { EnrollmentSnapshotCard } from './EnrollmentSnapshotCard';
import {
  useAcademicPerformanceSummary,
  useCalendarOverview,
  useClassesNeedingCover,
  useEarlyLeavesToday,
  useEnrollmentSnapshot,
  useMyClasses,
  useIsSchoolDayToday,
  useNewThisTerm,
  useRecentAnnouncements,
  useRecentAuditActivity,
  useRecentNotifications,
  useStaffOnLeaveToday,
  useStudentAttendanceToday,
  useThisWeeksEvents,
  useTodaysBirthdays,
  useUpcomingCoverAssignments,
} from './hooks';
import { MissionCard } from './MissionCard';
import { MyClassAttendanceCard } from './MyClassAttendanceCard';
import { NewThisTermCard } from './NewThisTermCard';
import { NotificationsDigestCard } from './NotificationsDigestCard';
import { OutstandingMarkSheetsCard } from './OutstandingMarkSheetsCard';
import { StaffAttendanceDetailCard } from './StaffAttendanceDetailCard';
import { TodayCard } from './TodayCard';
import { useWidgetPrefs } from './widgetPrefs';
import { WeekEventsCard } from './WeekEventsCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Replaces the header's name subtitle with something contextual — a birthday beats the time-of-day greeting when both apply. */
function getGreeting(now: Date, birthDate?: string | null): { title: string; subtitle: string } {
  if (birthDate) {
    const [, month, day] = birthDate.split('-').map(Number);
    if (month === now.getMonth() + 1 && day === now.getDate()) {
      return { title: 'Happy birthday! 🎉', subtitle: 'Wishing you a wonderful day.' };
    }
  }
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return { title: 'Good morning', subtitle: 'Have a nice day.' };
  if (hour >= 12 && hour < 17) return { title: 'Good afternoon', subtitle: 'Have a nice day.' };
  if (hour >= 17 && hour < 21) return { title: 'Good evening', subtitle: 'Have a nice day.' };
  return { title: 'Good night', subtitle: 'Have a nice day.' };
}

/**
 * AdminSpec.md section 10, Home composition. Every block below is shown
 * only when it has something to say — the same "RLS decides who sees
 * data, an empty result hides the block" pattern used everywhere else in
 * this app (no client-side permission mirror is loaded). Ordering follows
 * the spec's own rule: "blocks the user must act on come before blocks the
 * user merely reads."
 */
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const openDrawer = useOpenDrawer();
  const staff = useAuthStore((s) => s.staff);
  const { isEnabled } = useWidgetPrefs();
  const isSchoolDay = useIsSchoolDayToday();
  const myClasses = useMyClasses(staff?.id);
  const onDate = todayIso();
  const greeting = getGreeting(new Date(), staff?.birthDate);

  const marking = useMarkingStatus(onDate);
  const staffBoard = useStaffAttendanceToday(onDate);
  const pendingLeave = usePendingLeaveRequests();
  const staffOnLeave = useStaffOnLeaveToday(isEnabled('schoolPulse'));
  const atRisk = useQuery({
    queryKey: ['home', 'at-risk'],
    queryFn: fetchStudentsAtRisk,
    enabled: isEnabled('needsAttention'),
  });
  const needsCover = useClassesNeedingCover(onDate);
  const outstandingSheets = useOutstandingMarkSheets();
  const lowStock = useQuery({
    queryKey: ['home', 'low-stock'],
    queryFn: async () => (await listInventoryItems('')).filter((i) => i.lowStock),
    enabled: isEnabled('needsAttention'),
  });
  const myDuties = useQuery({
    queryKey: ['home', 'my-duties', staff?.id],
    queryFn: () => fetchResponsibilitiesForStaff(staff!.id),
    enabled: !!staff && isEnabled('today'),
  });
  const todaysEvents = useQuery({
    queryKey: ['home', 'todays-events', onDate],
    queryFn: async () => {
      const [y, m] = onDate.split('-').map(Number);
      const events = await listEventsInMonth(y, m);
      return events.filter((e) => e.startsOn <= onDate && (e.endsOn ?? e.startsOn) >= onDate);
    },
    enabled: isEnabled('today'),
  });
  const academicPerformance = useAcademicPerformanceSummary(isEnabled('academicPerformance'));
  const birthdays = useTodaysBirthdays(isEnabled('birthdays'));
  const studentAttendanceToday = useStudentAttendanceToday(onDate, isEnabled('schoolPulse'));
  const recentAnnouncements = useRecentAnnouncements(staff?.id, isEnabled('announcementsFeed'));
  const recentNotifications = useRecentNotifications(isEnabled('notificationsDigest'));
  const weekEvents = useThisWeeksEvents(isEnabled('weekEvents'));
  const earlyLeavesToday = useEarlyLeavesToday(onDate, isEnabled('earlyLeaveLog'));
  const upcomingCover = useUpcomingCoverAssignments(isEnabled('coverAssignments'));
  const enrollmentSnapshot = useEnrollmentSnapshot(isEnabled('enrollmentSnapshot'));
  const calendarOverview = useCalendarOverview(isEnabled('calendarOverview'));
  const recentAudit = useRecentAuditActivity(isEnabled('auditActivity'));
  const newThisTerm = useNewThisTerm(isEnabled('newThisTerm'));

  const loading = isSchoolDay.isLoading || myClasses.isLoading;
  const unmarked = (marking.data ?? []).filter((c) => !c.submitted);
  const presentStaff = (staffBoard.data ?? []).filter((s) => s.status === 'present' || s.status === 'late').length;
  const totalStaff = staffBoard.data?.length ?? 0;
  const classesMarked = (marking.data ?? []).filter((c) => c.submitted).length;
  const totalClasses = marking.data?.length ?? 0;

  // Built as a flat list, then chunked 2-per-row below, so a hidden metric (e.g. no classes
  // marked yet) closes the gap instead of leaving an empty cell in a fixed 2x2 grid.
  const schoolPulseMetrics: { key: string; label: string; value: string; onPress?: () => void }[] = [];
  if (totalStaff > 0) schoolPulseMetrics.push({ key: 'staff', label: 'Staff present', value: `${presentStaff}/${totalStaff}` });
  schoolPulseMetrics.push({
    key: 'approvals',
    label: 'Approvals pending',
    value: String(pendingLeave.data?.length ?? 0),
    onPress: () => navigation.navigate('LeaveRequests'),
  });
  if (studentAttendanceToday.data?.totalMarked) {
    schoolPulseMetrics.push({
      key: 'attendance',
      label: 'Student attendance',
      value: `${Math.round((100 * studentAttendanceToday.data.presentCount) / studentAttendanceToday.data.totalMarked)}%`,
    });
  }
  if (totalClasses > 0) schoolPulseMetrics.push({ key: 'marked', label: 'Classes marked', value: `${classesMarked}/${totalClasses}` });
  const schoolPulseRows = [schoolPulseMetrics.slice(0, 2), schoolPulseMetrics.slice(2, 4)].filter((row) => row.length > 0);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="school-outline" />
        <ScreenHeader
          title={greeting.title}
          subtitle={greeting.subtitle}
          onMenuPress={openDrawer}
          tone="onPrimary"
        >
          {staff ? (
            <Avatar
              name={staff.fullName}
              tone="onPrimary"
              size={32}
              onPress={() => navigation.navigate('StaffProfile', { staffId: staff.id })}
            />
          ) : null}
        </ScreenHeader>

        {loading ? (
          <ActivityIndicator color={colors.white} style={{ marginTop: spacing.xl }} />
        ) : !isSchoolDay.data ? (
          <Card style={{ marginTop: spacing.lg, paddingVertical: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs }}>
              <Icon name="moon-outline" size={16} color={semantic.textPrimary} />
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>Not a school day</Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {isEnabled('myClassAttendance')
              ? myClasses.data?.map((c) => <MyClassAttendanceCard key={c.classId} myClass={c} />)
              : null}
          </View>
        )}
      </Hero>

      <View style={styles.body}>
        {isEnabled('schoolMission') ? <MissionCard /> : null}

        {isEnabled('unmarkedClasses') && unmarked.length > 0 ? <UnmarkedClassesCard classes={unmarked} onDate={onDate} /> : null}

        {isEnabled('schoolPulse') && (totalStaff > 0 || pendingLeave.data?.length || staffOnLeave.data?.length || studentAttendanceToday.data?.totalMarked) ? (
          <Card>
            <SectionHeader icon="pulse-outline" label="SCHOOL PULSE" />
            {schoolPulseRows.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm }}>
                {row.map((m) => (
                  <Metric key={m.key} label={m.label} value={m.value} onPress={m.onPress} />
                ))}
              </View>
            ))}
            {staffOnLeave.data?.length ? (
              <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: spacing.xs }}>
                On leave today: {staffOnLeave.data.map((s) => s.fullName).join(', ')}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {isEnabled('needsAttention') ? (
          <NeedsAttention
            pendingLeaveCount={pendingLeave.data?.length ?? 0}
            atRiskCount={atRisk.data?.length ?? 0}
            needsCoverCount={needsCover.data?.length ?? 0}
            lowStockCount={lowStock.data?.length ?? 0}
            outstandingSheetsCount={outstandingSheets.data?.length ?? 0}
            onNavigate={navigation.navigate}
          />
        ) : null}

        <View style={styles.grid}>
          {isEnabled('today') && ((myDuties.data?.length ?? 0) > 0 || (todaysEvents.data?.length ?? 0) > 0) ? (
            <View style={styles.gridItem}>
              <TodayCard duties={myDuties.data ?? []} events={todaysEvents.data ?? []} />
            </View>
          ) : null}

          {isEnabled('academicPerformance') && academicPerformance.data?.avgPct != null ? (
            <View style={styles.gridItem}>
              <AcademicPerformanceCard summary={academicPerformance.data} />
            </View>
          ) : null}

          {isEnabled('birthdays') && (birthdays.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <BirthdaysCard birthdays={birthdays.data!} />
            </View>
          ) : null}

          {isEnabled('announcementsFeed') && (recentAnnouncements.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <AnnouncementsFeedCard announcements={recentAnnouncements.data!} />
            </View>
          ) : null}

          {isEnabled('notificationsDigest') && (recentNotifications.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <NotificationsDigestCard notifications={recentNotifications.data!} />
            </View>
          ) : null}

          {isEnabled('weekEvents') && (weekEvents.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <WeekEventsCard events={weekEvents.data!} />
            </View>
          ) : null}

          {isEnabled('earlyLeaveLog') && (earlyLeavesToday.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <EarlyLeaveLogCard earlyLeaves={earlyLeavesToday.data!} />
            </View>
          ) : null}

          {isEnabled('outstandingMarkSheetsList') && (outstandingSheets.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <OutstandingMarkSheetsCard sheets={outstandingSheets.data!} />
            </View>
          ) : null}

          {isEnabled('coverAssignments') && (upcomingCover.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <CoverAssignmentsCard assignments={upcomingCover.data!} />
            </View>
          ) : null}

          {isEnabled('staffAttendanceDetail') && (staffBoard.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <StaffAttendanceDetailCard staff={staffBoard.data!} />
            </View>
          ) : null}

          {isEnabled('enrollmentSnapshot') && (enrollmentSnapshot.data?.totalStudents ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <EnrollmentSnapshotCard snapshot={enrollmentSnapshot.data!} />
            </View>
          ) : null}

          {isEnabled('calendarOverview') && (calendarOverview.data?.upcoming.length || calendarOverview.data?.currentTermEndsOn) ? (
            <View style={styles.gridItem}>
              <CalendarOverviewCard overview={calendarOverview.data!} />
            </View>
          ) : null}

          {isEnabled('auditActivity') && (recentAudit.data?.length ?? 0) > 0 ? (
            <View style={styles.gridItem}>
              <AuditActivityCard entries={recentAudit.data!} />
            </View>
          ) : null}

          {isEnabled('newThisTerm') && ((newThisTerm.data?.newStudents ?? 0) > 0 || (newThisTerm.data?.newStaff ?? 0) > 0) ? (
            <View style={styles.gridItem}>
              <NewThisTermCard data={newThisTerm.data!} />
            </View>
          ) : null}
        </View>

        {isEnabled('quickActions') ? <QuickActions /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { flexBasis: '47%', flexGrow: 1 },
});

function Metric({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        onPress={onPress}
        style={{ ...typography.title, color: onPress ? semantic.primary : semantic.textPrimary }}
      >
        {value}
      </Text>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
    </View>
  );
}

function UnmarkedClassesCard({ classes, onDate }: { classes: { classId: string; className: string }[]; onDate: string }) {
  const queryClient = useQueryClient();
  const [reminding, setReminding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remindAll() {
    setReminding(true);
    try {
      const count = await remindUnmarkedClassesBulk(onDate);
      setMessage(count > 0 ? `Reminded ${count}.` : 'Already reminded recently.');
    } catch {
      setMessage("Couldn't send reminders.");
    } finally {
      setReminding(false);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...typography.bodyStrong, color: colors.error }}>
          {classes.length} {classes.length === 1 ? 'class' : 'classes'} not marked
        </Text>
        <Button label="Remind" size="sm" variant="outline" loading={reminding} onPress={() => void remindAll()} />
      </View>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{classes.map((c) => c.className).join(' · ')}</Text>
      {message ? <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: spacing.xs }}>{message}</Text> : null}
    </Card>
  );
}

function NeedsAttention({
  pendingLeaveCount,
  atRiskCount,
  needsCoverCount,
  lowStockCount,
  outstandingSheetsCount,
  onNavigate,
}: {
  pendingLeaveCount: number;
  atRiskCount: number;
  needsCoverCount: number;
  lowStockCount: number;
  outstandingSheetsCount: number;
  onNavigate: Nav['navigate'];
}) {
  const rows: { label: string; count: number; onPress: () => void }[] = [
    { label: 'Leave requests waiting', count: pendingLeaveCount, onPress: () => onNavigate('LeaveRequests') },
    { label: 'Classes without a cover teacher', count: needsCoverCount, onPress: () => onNavigate('AssignCover', undefined) },
    { label: 'Students at absence risk', count: atRiskCount, onPress: () => onNavigate('Tabs', { screen: 'StudentSearch' }) },
    { label: 'Mark sheets outstanding', count: outstandingSheetsCount, onPress: () => onNavigate('MarksReview') },
    { label: 'Items low on stock', count: lowStockCount, onPress: () => onNavigate('Inventory') },
  ].filter((r) => r.count > 0);

  if (rows.length === 0) return null;

  return (
    <Card>
      <SectionHeader icon="alert-circle-outline" label="NEEDS ATTENTION" />
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }} onPress={r.onPress}>
            {r.label}
          </Text>
          <StatusPill label={String(r.count)} tone="warning" />
        </View>
      ))}
    </Card>
  );
}

function QuickActions() {
  const navigation = useNavigation<Nav>();
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState(toDMY(todayIso()));
  const [closeLabel, setCloseLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitClosure() {
    const isoCloseDate = parseDMY(closeDate);
    if (!isoCloseDate) {
      Alert.alert('Invalid date', 'Enter the date as DD/MM/YYYY.');
      return;
    }
    setBusy(true);
    try {
      await declareClosure(isoCloseDate, closeLabel.trim() || undefined);
      setClosing(false);
      setCloseLabel('');
      Alert.alert('Closure declared', 'All staff have been notified.');
    } catch {
      Alert.alert('Could not declare a closure', 'You may not have permission to edit the calendar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader icon="flash-outline" label="QUICK ACTIONS" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        <Button label="Announce" size="sm" variant="outline" onPress={() => navigation.navigate('ComposeAnnouncement')} />
        <Button label="Find student" size="sm" variant="outline" onPress={() => navigation.navigate('Tabs', { screen: 'StudentSearch' })} />
        {!closing ? (
          <Button label="Declare closure" size="sm" variant="outline" onPress={() => setClosing(true)} />
        ) : null}
        <Button label="Audit log" size="sm" variant="outline" onPress={() => navigation.navigate('AuditLog')} />
      </View>
      {closing ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Date" placeholder="DD/MM/YYYY" value={closeDate} onChangeText={setCloseDate} />
          <TextField label="Reason (optional)" value={closeLabel} onChangeText={setCloseLabel} placeholder="e.g. severe weather" />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Confirm closure" size="sm" variant="danger" loading={busy} onPress={() => void submitClosure()} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setClosing(false)} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
