import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill, SyncStatusBadge } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import { remindUnmarkedClass, remindUnmarkedClassesBulk } from './api';
import { todayIso, useMarkingStatus, useStaffAttendanceToday } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'students' | 'staff';

const staffStatusTone: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  present: 'success',
  late: 'warning',
  on_leave: 'neutral',
  absent: 'error',
  not_checked_in: 'neutral',
};
const staffStatusLabel: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  on_leave: 'On leave',
  absent: 'Absent',
  not_checked_in: 'Not checked in',
};

export function AttendanceBoardScreen() {
  const navigation = useNavigation<Nav>();
  const onDate = todayIso();
  const [tab, setTab] = useState<Tab>('students');

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Attendance board" tone="onPrimary" />
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Button
            label="Classes"
            icon="school-outline"
            size="sm"
            variant={tab === 'students' ? 'secondary' : 'outline'}
            textColor={tab === 'students' ? undefined : colors.white}
            style={tab === 'students' ? undefined : { borderColor: 'rgba(255,255,255,0.6)' }}
            onPress={() => setTab('students')}
          />
          <Button
            label="Staff"
            icon="people-outline"
            size="sm"
            variant={tab === 'staff' ? 'secondary' : 'outline'}
            textColor={tab === 'staff' ? undefined : colors.white}
            style={tab === 'staff' ? undefined : { borderColor: 'rgba(255,255,255,0.6)' }}
            onPress={() => setTab('staff')}
          />
        </View>
        {tab === 'staff' ? (
          <Button
            label="Staff attendance"
            icon="checkmark-circle-outline"
            size="sm"
            variant="outline"
            textColor={colors.white}
            style={{ borderColor: 'rgba(255,255,255,0.6)', alignSelf: 'flex-start' }}
            onPress={() => navigation.navigate('MarkStaffAttendance')}
          />
        ) : null}
        <SyncStatusBadge />
      </Hero>

      {tab === 'students' ? (
        <ClassBoard onDate={onDate} onOpenClass={(classId) => navigation.navigate('ClassDetail', { classId })} />
      ) : (
        <StaffBoard onDate={onDate} />
      )}
    </Screen>
  );
}

function ClassBoard({ onDate, onOpenClass }: { onDate: string; onOpenClass: (classId: string) => void }) {
  const status = useMarkingStatus(onDate);
  const queryClient = useQueryClient();
  const [reminding, setReminding] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [remindError, setRemindError] = useState<string | null>(null);

  const unmarkedCount = (status.data ?? []).filter((c) => !c.submitted).length;

  async function remind(classId: string) {
    setReminding(classId);
    setRemindError(null);
    try {
      await remindUnmarkedClass(classId);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      setRemindError(
        message.includes('rate_limited')
          ? 'Already reminded recently — try again in a couple of minutes.'
          : "Couldn't send the reminder.",
      );
    } finally {
      setReminding(null);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  /** FR-ATT-12: reminds every unmarked class in scope in one action. */
  async function remindAll() {
    setRemindingAll(true);
    setRemindError(null);
    try {
      const count = await remindUnmarkedClassesBulk(onDate);
      setRemindError(count > 0 ? `Reminded ${count} ${count === 1 ? 'class' : 'classes'}.` : 'Nothing to remind right now.');
    } catch {
      setRemindError("Couldn't send reminders.");
    } finally {
      setRemindingAll(false);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  if (status.isLoading) return <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />;

  return (
    <FlatList
      data={status.data ?? []}
      keyExtractor={(item) => item.classId}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          {unmarkedCount > 1 ? (
            <Button
              label={`Remind ${unmarkedCount} unmarked classes`}
              variant="outline"
              loading={remindingAll}
              onPress={() => void remindAll()}
            />
          ) : null}
          {remindError ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{remindError}</Text> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="No classes in scope" />}
      renderItem={({ item }) => (
        <Card onPress={() => onOpenClass(item.classId)} flat>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ gap: 2, flex: 1 }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.className}</Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                Grade {item.gradeNumber} · {item.teacherName ?? 'No teacher assigned'}
              </Text>
            </View>
            {item.submitted ? (
              <StatusPill
                label={item.absentCount > 0 ? `${item.absentCount} absent` : 'All present'}
                tone={item.absentCount > 0 ? 'warning' : 'success'}
              />
            ) : (
              <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                <StatusPill label="Unmarked" tone="error" />
                <Button label="Remind" size="sm" variant="outline" loading={reminding === item.classId} onPress={() => void remind(item.classId)} />
              </View>
            )}
          </View>
        </Card>
      )}
    />
  );
}

function StaffBoard({ onDate }: { onDate: string }) {
  const staff = useStaffAttendanceToday(onDate);

  if (staff.isLoading) return <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />;

  return (
    <FlatList
      data={staff.data ?? []}
      keyExtractor={(item) => item.staffId}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
      ListEmptyComponent={<EmptyState title="No staff visible" message="You may only see your own attendance." />}
      renderItem={({ item }) => (
        <Card flat>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.fullName}</Text>
            <StatusPill label={staffStatusLabel[item.status]} tone={staffStatusTone[item.status]} />
          </View>
          {item.affectedClass ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary, marginTop: spacing.xs }}>
              {item.affectedClass.className} · {item.affectedClass.marked ? 'attendance marked' : 'attendance not yet marked'}
            </Text>
          ) : null}
        </Card>
      )}
    />
  );
}
