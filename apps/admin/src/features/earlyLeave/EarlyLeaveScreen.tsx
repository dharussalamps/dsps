import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, TextField } from '@/components';
import { useStudentsInClass } from '@/features/students/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { listEarlyLeavesToday, recordEarlyLeave } from './api';

type Route = RouteProp<RootStackParamList, 'EarlyLeave'>;

export function EarlyLeaveScreen() {
  const { params } = useRoute<Route>();
  const classId = params.classId;
  const onDate = format(new Date(), 'yyyy-MM-dd');
  const roster = useStudentsInClass(classId);
  const queryClient = useQueryClient();

  const studentIds = (roster.data ?? []).map((s) => s.id);
  const recorded = useQuery({
    queryKey: ['early-leaves', 'today', classId],
    queryFn: () => listEarlyLeavesToday(studentIds, onDate),
    enabled: studentIds.length > 0,
  });

  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [saving, setSaving] = useState(false);

  const recordedIds = new Set((recorded.data ?? []).map((r) => r.studentId));

  async function submit(studentId: string) {
    setSaving(true);
    try {
      await recordEarlyLeave({
        studentId,
        onDate,
        leftAt: format(new Date(), 'HH:mm'),
        reason,
        collectedBy,
      });
      setOpenStudentId(null);
      setReason('');
      setCollectedBy('');
      await queryClient.invalidateQueries({ queryKey: ['early-leaves', 'today', classId] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={roster.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={<ScreenHeader title="Early leave" subtitle={onDate} />}
        ListEmptyComponent={
          roster.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No students in this class" />
          )
        }
        renderItem={({ item }) => {
          const already = recordedIds.has(item.id);
          const open = openStudentId === item.id;
          return (
            <Card flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {item.preferredName || item.fullName}
                </Text>
                {already ? (
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Left already</Text>
                ) : (
                  <Button
                    label={open ? 'Cancel' : 'Record'}
                    size="sm"
                    variant={open ? 'ghost' : 'outline'}
                    onPress={() => setOpenStudentId(open ? null : item.id)}
                  />
                )}
              </View>
              {open ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <TextField placeholder="Reason (optional)" value={reason} onChangeText={setReason} />
                  <TextField placeholder="Collected by (optional)" value={collectedBy} onChangeText={setCollectedBy} />
                  <Button label="Confirm departure now" onPress={() => void submit(item.id)} loading={saving} />
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
