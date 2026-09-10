import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill } from '@/components';
import { fetchMyLeaveRequests } from '@/features/leave/api';
import { useCurrentYearTerms } from '@/features/calendar/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { ResponsibilitiesSection } from './ResponsibilitiesSection';
import { useStaffAttendanceSummary, useStaffProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StaffProfile'>;

const leaveStatusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'error',
  withdrawn: 'neutral',
};

/**
 * FR-STF-05: "a staff profile shows attendance summary, responsibilities
 * and leave taken, subject to the viewer's permissions." Attendance summary
 * and leave history previously had no query or UI at all — RLS
 * (can_view_staff_attendance / can_view_staff_leave) already governs who
 * this returns anything for, so an unauthorized viewer simply sees these
 * sections render nothing (FR-STF-06), the same pattern used everywhere
 * else in the app.
 */
export function StaffProfileScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const profile = useStaffProfile(params.staffId);
  const terms = useCurrentYearTerms();
  const termStart = terms.data?.[0]?.startsOn;
  const attendance = useStaffAttendanceSummary(params.staffId, termStart ?? '1970-01-01');
  const leave = useQuery({
    queryKey: ['leave', 'staff-history', params.staffId],
    queryFn: () => fetchMyLeaveRequests(params.staffId),
  });

  if (profile.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Staff profile" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Staff profile" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Staff member not found" message="They may be outside what you have access to view." />
        </View>
      </Screen>
    );
  }

  const s = profile.data;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={s.fullName} subtitle={s.staffNo} tone="onPrimary" back={navigation.canGoBack()}>
          {s.status !== 'active' ? <StatusPill label={s.status} tone="neutral" /> : null}
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Card>
        <Button label={s.phone} variant="outline" onPress={() => Linking.openURL(`tel:${s.phone}`)} />
        {s.email ? (
          <Button label={s.email} variant="ghost" size="sm" onPress={() => Linking.openURL(`mailto:${s.email}`)} />
        ) : null}
      </Card>

      {attendance.data && attendance.data.totalDays > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ATTENDANCE THIS TERM</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
            <Metric label="Present" value={attendance.data.presentDays} />
            <Metric label="Late" value={attendance.data.lateDays} />
            <Metric label="Leave" value={attendance.data.leaveDays} />
            <Metric label="Absent" value={attendance.data.absentDays} />
          </View>
        </Card>
      ) : null}

      <ResponsibilitiesSection staffId={s.id} />

      {leave.data && leave.data.length > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LEAVE TAKEN</Text>
          {leave.data.slice(0, 10).map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs }}>
              <View>
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>{l.leaveTypeName}</Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                  {l.startsOn} → {l.endsOn} · {l.dayCount} {l.dayCount === 1 ? 'day' : 'days'}
                </Text>
              </View>
              <StatusPill label={l.status} tone={leaveStatusTone[l.status]} />
            </View>
          ))}
        </Card>
      ) : null}
      </View>
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ ...typography.title, color: semantic.textPrimary }}>{value}</Text>
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
    </View>
  );
}
