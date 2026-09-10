import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Icon, Screen, ScreenHeader, StatusPill, SyncStatusBadge } from '@/components';
import { GuardianCallButton } from '@/features/students/GuardianCallButton';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { fetchPrimaryGuardianPhones } from './api';
import { useExistingSubmission } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AttendanceSubmitted'>;

export function AttendanceSubmittedScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { classId, onDate, localAbsentees } = params;

  const existing = useExistingSubmission(classId, onDate);

  // Server-confirmed list (with consecutive-day counts) once it's available;
  // until then, fall back to what the teacher just marked locally so the
  // screen never looks empty right after an offline submit.
  const absentees =
    existing.data?.absentees ??
    (localAbsentees ?? []).map((a) => ({ studentId: a.studentId, fullName: a.fullName, consecutiveAbsences: null as number | null }));

  const studentIds = absentees.map((a) => a.studentId);
  const guardianPhones = useQuery({
    queryKey: ['attendance', 'guardian-phones', studentIds],
    queryFn: () => fetchPrimaryGuardianPhones(studentIds),
    enabled: studentIds.length > 0,
  });

  const confirmedByServer = existing.data != null;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Attendance submitted" subtitle={onDate} tone="onPrimary" back={navigation.canGoBack()}>
          <StatusPill label={confirmedByServer ? 'Confirmed' : 'Saved on device'} tone={confirmedByServer ? 'success' : 'gold'} />
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <SyncStatusBadge />

      {absentees.length === 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="ribbon-outline" size={18} color={semantic.textPrimary} />
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>Full attendance today</Text>
          </View>
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>
            {absentees.length} ABSENT
          </Text>
          {absentees.map((a) => {
            const phone = guardianPhones.data?.[a.studentId];
            return (
              <Card key={a.studentId} flat>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ gap: 2 }}>
                    <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{a.fullName}</Text>
                    {a.consecutiveAbsences != null && a.consecutiveAbsences > 1 ? (
                      <StatusPill label={`${a.consecutiveAbsences} days in a row`} tone="warning" />
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    {phone ? <GuardianCallButton studentId={a.studentId} phone={phone} /> : null}
                    <Button
                      label="View"
                      size="sm"
                      variant="ghost"
                      onPress={() => navigation.navigate('StudentProfile', { studentId: a.studentId })}
                    />
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}

      {absentees.length === 0 && !existing.data && localAbsentees == null ? (
        <EmptyState title="No submission found" message="This class may not have been submitted for this date yet." />
      ) : (
        <Button label="Record early leave" variant="outline" onPress={() => navigation.navigate('EarlyLeave', { classId })} />
      )}
      </View>
    </Screen>
  );
}
