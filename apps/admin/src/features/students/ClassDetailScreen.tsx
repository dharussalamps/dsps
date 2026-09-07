import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ActivityIndicator, FlatList } from 'react-native';
import { EmptyState, Screen, ScreenHeader } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing } from '@/theme/tokens';
import { StudentListItem } from './StudentListItem';
import { useStudentsInClass } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ClassDetail'>;

export function ClassDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const roster = useStudentsInClass(params.classId);

  return (
    <Screen scroll={false}>
      <FlatList
        data={roster.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={<ScreenHeader title="Roster" subtitle={`${roster.data?.length ?? 0} students`} />}
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
