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
import { todayIso, useMarkingStatus } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AttendanceBoardScreen() {
  const navigation = useNavigation<Nav>();
  const onDate = todayIso();
  const status = useMarkingStatus(onDate);
  const queryClient = useQueryClient();
  const [reminding, setReminding] = useState<string | null>(null);

  const unmarkedCount = status.data?.filter((c) => !c.submitted).length ?? 0;

  async function remind(classId: string) {
    setReminding(classId);
    try {
      await remindUnmarkedClass(classId);
    } finally {
      setReminding(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader
          title="Attendance board"
          subtitle={status.isLoading ? undefined : `${unmarkedCount} of ${status.data?.length ?? 0} classes unmarked`}
        />
        <SyncStatusBadge />
      </View>

      {status.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={status.data ?? []}
          keyExtractor={(item) => item.classId}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No classes in scope" />}
          renderItem={({ item }) => (
            <Card onPress={() => navigation.navigate('ClassDetail', { classId: item.classId })} flat>
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
                    <Button
                      label="Remind"
                      size="sm"
                      variant="outline"
                      loading={reminding === item.classId}
                      onPress={() => void remind(item.classId).then(() => queryClient.invalidateQueries({ queryKey: ['attendance', 'marking-status'] }))}
                    />
                  </View>
                )}
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
