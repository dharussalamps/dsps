import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusPill } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { CheckInCard } from './CheckInCard';
import { useMyClasses, useIsSchoolDayToday } from './hooks';
import { MyClassAttendanceCard } from './MyClassAttendanceCard';

/**
 * AdminSpec.md section 10, Home composition. Built incrementally — see
 * docs/AdminSpec.md section 17: only "my class attendance card" (the
 * spec's own top priority — "the single most important flow") is real so
 * far. Section status / School pulse / Needs attention / Today / Quick
 * actions each need data sources built in later tasks (11, 13, 17, 19...)
 * and are listed below as what's coming, not built as empty shells.
 */
export function HomeScreen() {
  const staff = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);
  const isSchoolDay = useIsSchoolDayToday();
  const myClasses = useMyClasses(staff?.id);

  const loading = isSchoolDay.isLoading || myClasses.isLoading;

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

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>COMING TO HOME</Text>
        {[
          { label: 'Section status (unmarked classes in your grade)', task: 10 },
          { label: 'School pulse (school-wide attendance %, staff present)', task: 20 },
          { label: 'Needs attention (leave requests, at-risk students, low stock...)', task: 13 },
          { label: "Today (your duties, today's events)", task: 17 },
          { label: 'Quick actions (announce, find student, declare closure)', task: 16 },
        ].map((row) => (
          <Card key={row.label} flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>{row.label}</Text>
              <StatusPill label={`Task ${row.task}`} tone="gold" />
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
