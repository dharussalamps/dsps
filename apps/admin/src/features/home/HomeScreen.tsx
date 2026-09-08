import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import { fetchStudentsAtRisk } from '@/features/analytics/api';
import { remindUnmarkedClassesBulk } from '@/features/attendance/api';
import { todayIso, useMarkingStatus, useStaffAttendanceToday } from '@/features/attendance/hooks';
import { declareClosure } from '@/features/calendar/api';
import { listEventsInMonth } from '@/features/events/api';
import { listInventoryItems } from '@/features/inventory/api';
import { usePendingLeaveRequests } from '@/features/leave/hooks';
import { useOutstandingMarkSheets } from '@/features/marks/hooks';
import { fetchResponsibilitiesForStaff } from '@/features/staff/api';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { CheckInCard } from './CheckInCard';
import { useClassesNeedingCover, useMyClasses, useIsSchoolDayToday } from './hooks';
import { MyClassAttendanceCard } from './MyClassAttendanceCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
  const staff = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);
  const isSchoolDay = useIsSchoolDayToday();
  const myClasses = useMyClasses(staff?.id);
  const onDate = todayIso();

  const marking = useMarkingStatus(onDate);
  const staffBoard = useStaffAttendanceToday(onDate);
  const pendingLeave = usePendingLeaveRequests();
  const atRisk = useQuery({ queryKey: ['home', 'at-risk'], queryFn: fetchStudentsAtRisk });
  const needsCover = useClassesNeedingCover(onDate);
  const outstandingSheets = useOutstandingMarkSheets();
  const lowStock = useQuery({
    queryKey: ['home', 'low-stock'],
    queryFn: async () => (await listInventoryItems('')).filter((i) => i.lowStock),
  });
  const myDuties = useQuery({
    queryKey: ['home', 'my-duties', staff?.id],
    queryFn: () => fetchResponsibilitiesForStaff(staff!.id),
    enabled: !!staff,
  });
  const todaysEvents = useQuery({
    queryKey: ['home', 'todays-events', onDate],
    queryFn: async () => {
      const [y, m] = onDate.split('-').map(Number);
      const events = await listEventsInMonth(y, m);
      return events.filter((e) => e.startsOn <= onDate && (e.endsOn ?? e.startsOn) >= onDate);
    },
  });

  const loading = isSchoolDay.isLoading || myClasses.isLoading;
  const unmarked = (marking.data ?? []).filter((c) => !c.submitted);
  const presentStaff = (staffBoard.data ?? []).filter((s) => s.status === 'present' || s.status === 'late').length;
  const totalStaff = staffBoard.data?.length ?? 0;

  return (
    <Screen>
      <ScreenHeader title="Home" subtitle={staff ? `Hello, ${staff.fullName}` : undefined}>
        <Button label="Sign out" variant="ghost" size="sm" onPress={() => void signOut()} />
      </ScreenHeader>

      {loading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : !isSchoolDay.data ? (
        <EmptyState title="Not a school day" message="Attendance marking opens on the next school day." />
      ) : (
        <View style={{ gap: spacing.md }}>
          {myClasses.data?.map((c) => (
            <MyClassAttendanceCard key={c.classId} myClass={c} />
          ))}
          {staff ? <CheckInCard staffId={staff.id} /> : null}
        </View>
      )}

      {unmarked.length > 0 ? <UnmarkedClassesCard classes={unmarked} onDate={onDate} /> : null}

      {totalStaff > 0 || pendingLeave.data?.length ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>SCHOOL PULSE</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm }}>
            {totalStaff > 0 ? <Metric label="Staff present" value={`${presentStaff}/${totalStaff}`} /> : null}
            <Metric label="Approvals pending" value={String(pendingLeave.data?.length ?? 0)} onPress={() => navigation.navigate('LeaveRequests')} />
          </View>
        </Card>
      ) : null}

      <NeedsAttention
        pendingLeaveCount={pendingLeave.data?.length ?? 0}
        atRiskCount={atRisk.data?.length ?? 0}
        needsCoverCount={needsCover.data?.length ?? 0}
        lowStockCount={lowStock.data?.length ?? 0}
        outstandingSheetsCount={outstandingSheets.data?.length ?? 0}
        onNavigate={navigation.navigate}
      />

      {(myDuties.data?.length ?? 0) > 0 || (todaysEvents.data?.length ?? 0) > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>TODAY</Text>
          {myDuties.data?.map((d) => (
            <Text key={d.id} style={{ ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.xs }}>
              {d.title}
              {d.scheduleNote ? ` · ${d.scheduleNote}` : ''}
            </Text>
          ))}
          {todaysEvents.data?.map((e) => (
            <Text key={e.id} style={{ ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.xs }}>
              📅 {e.title}
            </Text>
          ))}
        </Card>
      ) : null}

      <QuickActions />
    </Screen>
  );
}

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
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>NEEDS ATTENTION</Text>
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
  const [closeDate, setCloseDate] = useState(todayIso());
  const [closeLabel, setCloseLabel] = useState('');
  const [busy, setBusy] = useState(false);

  async function submitClosure() {
    setBusy(true);
    try {
      await declareClosure(closeDate, closeLabel.trim() || undefined);
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
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>QUICK ACTIONS</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
        <Button label="Announce" size="sm" variant="outline" onPress={() => navigation.navigate('ComposeAnnouncement')} />
        <Button label="Find student" size="sm" variant="outline" onPress={() => navigation.navigate('Tabs', { screen: 'StudentSearch' })} />
        {!closing ? (
          <Button label="Declare closure" size="sm" variant="outline" onPress={() => setClosing(true)} />
        ) : null}
      </View>
      {closing ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Date" placeholder="YYYY-MM-DD" value={closeDate} onChangeText={setCloseDate} />
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
