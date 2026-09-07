import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusPill, SyncStatusBadge } from '@/components';
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
    <Screen>
      <ScreenHeader title="Attendance submitted" subtitle={onDate}>
        <StatusPill label={confirmedByServer ? 'Confirmed' : 'Saved on device'} tone={confirmedByServer ? 'success' : 'gold'} />
      </ScreenHeader>

      <SyncStatusBadge />

      {absentees.length === 0 ? (
        <Card>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>Full attendance today 🎉</Text>
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
                    {phone ? (
                      <Button label="Call" size="sm" variant="outline" onPress={() => Linking.openURL(`tel:${phone}`)} />
                    ) : null}
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
      ) : null}
    </Screen>
  );
}
