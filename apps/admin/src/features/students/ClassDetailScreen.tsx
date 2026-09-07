import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Button, EmptyState, Screen, ScreenHeader } from '@/components';
import { todayIso, useExistingSubmission } from '@/features/attendance/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing } from '@/theme/tokens';
import { StudentListItem } from './StudentListItem';
import { useStudentsInClass } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ClassDetail'>;

export function ClassDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const classId = params.classId;
  const roster = useStudentsInClass(classId);
  const onDate = todayIso();
  const submission = useExistingSubmission(classId, onDate);

  return (
    <Screen scroll={false}>
      <FlatList
        data={roster.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            <ScreenHeader title="Roster" subtitle={`${roster.data?.length ?? 0} students`} />
            {submission.data ? (
              <Button
                label="View today's attendance"
                variant="outline"
                onPress={() => navigation.navigate('AttendanceSubmitted', { classId, onDate })}
              />
            ) : (
              <Button label="Mark attendance" onPress={() => navigation.navigate('MarkAttendance', { classId })} />
            )}
          </View>
        }
        ListEmptyComponent={
          roster.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No students in this class" />
          )
        }
        renderItem={({ item }) => (
          <StudentListItem student={item} onPress={() => navigation.navigate('StudentProfile', { studentId: item.id })} />
        )}
      />
    </Screen>
  );
}
