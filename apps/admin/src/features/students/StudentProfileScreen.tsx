import { useRoute, type RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusPill } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { useStudentGuardians, useStudentProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StudentProfile'>;

const upcomingTabs = [
  { label: 'Attendance', buildTask: 9 },
  { label: 'Marks', buildTask: 14 },
  { label: 'Activity', buildTask: 15 },
  { label: 'Benefits', buildTask: 15 },
];

export function StudentProfileScreen() {
  const { params } = useRoute<Route>();
  const profile = useStudentProfile(params.studentId);
  const guardians = useStudentGuardians(params.studentId);

  if (profile.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen>
        <EmptyState title="Student not found" message="It may be outside what you have access to view." />
      </Screen>
    );
  }

  const s = profile.data;
  const displayName = s.preferredName || s.fullName;

  return (
    <Screen>
      <ScreenHeader title={displayName} subtitle={s.admissionNo}>
        {s.status !== 'active' ? <StatusPill label={s.status} tone="neutral" /> : null}
      </ScreenHeader>

      <Card>
        <Row label="Class" value={s.className ?? '—'} />
        <Row label="Roll no." value={s.rollNo ?? '—'} />
        <Row label="Date of birth" value={s.dateOfBirth ?? '—'} />
      </Card>

      {guardians.data && guardians.data.length > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>GUARDIANS</Text>
          {guardians.data.map((g) => (
            <View key={g.guardianId} style={{ gap: 2, marginTop: spacing.sm }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                {g.fullName} {g.isPrimary ? '· Primary' : ''}
              </Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{g.relationship ?? ''}</Text>
              <Button
                label={g.phonePrimary}
                variant="ghost"
                size="sm"
                onPress={() => Linking.openURL(`tel:${g.phonePrimary}`)}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>MORE ABOUT THIS STUDENT</Text>
        {upcomingTabs.map((tab) => (
          <View
            key={tab.label}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}
          >
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{tab.label}</Text>
            <StatusPill label={`Build task ${tab.buildTask}`} tone="gold" />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}
