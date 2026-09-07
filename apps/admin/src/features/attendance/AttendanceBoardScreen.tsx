import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, SyncStatusBadge } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { remindUnmarkedClass } from './api';
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
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="Attendance board" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Classes" size="sm" variant={tab === 'students' ? 'primary' : 'outline'} onPress={() => setTab('students')} />
          <Button label="Staff" size="sm" variant={tab === 'staff' ? 'primary' : 'outline'} onPress={() => setTab('staff')} />
        </View>
        <SyncStatusBadge />
      </View>

      {tab === 'students' ? (
        <ClassBoard onDate={onDate} onOpenClass={(classId) => navigation.navigate('ClassDetail', { classId })} />
      ) : (
        <StaffBoard onDate={onDate} />
      )}
    </SafeAreaView>
  );
}

function ClassBoard({ onDate, onOpenClass }: { onDate: string; onOpenClass: (classId: string) => void }) {
  const status = useMarkingStatus(onDate);
  const queryClient = useQueryClient();
  const [reminding, setReminding] = useState<string | null>(null);

  async function remind(classId: string) {
    setReminding(classId);
    try {
      await remindUnmarkedClass(classId);
    } finally {
      setReminding(null);
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] });
    }
  }

  if (status.isLoading) return <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />;

  return (
    <FlatList
      data={status.data ?? []}
      keyExtractor={(item) => item.classId}
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
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
        </Card>
      )}
    />
  );
}
