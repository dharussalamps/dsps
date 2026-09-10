import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill } from '@/components';
import { useCurrentTerm, useStudentMarks, useStudentTermPosition, useStudentTermTrend } from '@/features/marks/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { setStudentStatus } from './api';
import { ActivitySection } from './ActivitySection';
import { AttendanceHistoryCalendar } from './AttendanceHistoryCalendar';
import { BenefitsSection } from './BenefitsSection';
import { GuardianCallButton } from './GuardianCallButton';
import { useStudentGuardians, useStudentProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StudentProfile'>;

export function StudentProfileScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const profile = useStudentProfile(params.studentId);
  const guardians = useStudentGuardians(params.studentId);
  const marks = useStudentMarks(params.studentId);
  const currentTerm = useCurrentTerm();
  const termPosition = useStudentTermPosition(params.studentId, currentTerm.data?.id);
  const termTrend = useStudentTermTrend(params.studentId);
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const [statusBusy, setStatusBusy] = useState(false);

  if (profile.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Student" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Student" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Student not found" message="It may be outside what you have access to view." />
        </View>
      </Screen>
    );
  }

  const s = profile.data;
  const displayName = s.preferredName || s.fullName;

  async function toggleLeft() {
    const next = s.status === 'left' ? 'active' : 'left';
    Alert.alert(
      next === 'left' ? 'Mark as left?' : 'Reactivate this student?',
      next === 'left'
        ? `${displayName} will be removed from rosters and counts. All their records are kept.`
        : `${displayName} will reappear on rosters and counts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: next === 'left' ? 'Mark as left' : 'Reactivate',
          style: next === 'left' ? 'destructive' : 'default',
          onPress: () => void doToggleLeft(next),
        },
      ],
    );
  }

  async function doToggleLeft(next: 'active' | 'left') {
    setStatusBusy(true);
    try {
      await setStudentStatus(s.id, next);
      await queryClient.invalidateQueries({ queryKey: ['students'] });
    } catch {
      Alert.alert('Could not update this student', 'You may not have permission to do this.');
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={displayName} subtitle={s.admissionNo} tone="onPrimary" back={navigation.canGoBack()}>
          {s.status !== 'active' ? <StatusPill label={s.status} tone="neutral" /> : null}
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <Card>
        <Row label="Class" value={s.className ?? '—'} />
        <Row label="Roll no." value={s.rollNo ?? '—'} />
        <Row label="Date of birth" value={s.dateOfBirth ?? '—'} />
      </Card>

      <AttendanceHistoryCalendar studentId={s.id} />

      {guardians.data && guardians.data.length > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>GUARDIANS</Text>
          {guardians.data.map((g) => (
            <View key={g.guardianId} style={{ gap: 2, marginTop: spacing.sm }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                {g.fullName} {g.isPrimary ? '· Primary' : ''}
              </Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{g.relationship ?? ''}</Text>
              <GuardianCallButton studentId={s.id} guardianId={g.guardianId} phone={g.phonePrimary} />
            </View>
          ))}
        </Card>
      ) : null}

      {marks.data && marks.data.length > 0 ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>MARKS</Text>
          {termPosition.data?.avgScore != null ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>
                {currentTerm.data?.name ?? 'This term'} average
              </Text>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                {termPosition.data.avgScore}
                {termPosition.data.classPosition ? ` · ${ordinal(termPosition.data.classPosition)} of ${termPosition.data.classSize}` : ''}
              </Text>
            </View>
          ) : null}
          {termTrend.data && termTrend.data.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.xs }}>
              {termTrend.data.map((t) => (
                <View key={t.termId} style={{ alignItems: 'center' }}>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{t.termName}</Text>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{t.avgScore}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {marks.data.map((m, i) => (
            <View key={`${m.subjectName}-${m.termName}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
              <View>
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>{m.subjectName}</Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{m.termName}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {m.score ?? '—'} / {m.maxScore}
                </Text>
                {m.classAverage != null ? (
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Class avg {m.classAverage}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <ActivitySection studentId={s.id} />
      <BenefitsSection studentId={s.id} />

      {staff ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>RECORD</Text>
          <Button
            label={s.status === 'left' ? 'Reactivate this student' : 'Mark as left'}
            variant={s.status === 'left' ? 'outline' : 'danger'}
            onPress={() => void toggleLeft()}
            loading={statusBusy}
          />
        </Card>
      ) : null}
      </View>
    </Screen>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}
