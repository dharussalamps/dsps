import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Button, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader } from '@/components';
import { todayIso, useExistingSubmission } from '@/features/attendance/hooks';
import { useCurrentTerm, useSubjectsForTeacherInClass } from '@/features/marks/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
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

  const staff = useAuthStore((s) => s.staff);
  const [pickingSubject, setPickingSubject] = useState(false);
  // FR-MRK-01: scoped to this teacher's own class_subject_teachers
  // assignment when one exists, so a class teacher can't enter marks for a
  // subject they aren't assigned — falls back to the full grade list for a
  // reviewer with no assignment row of their own (sectional head/principal).
  const subjects = useSubjectsForTeacherInClass(classId, staff?.id);
  const currentTerm = useCurrentTerm();

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="school-outline" bottomIcon="people-outline" />
        <ScreenHeader title="Roster" subtitle={`${roster.data?.length ?? 0} students`} tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <FlatList
        data={roster.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
            {submission.data ? (
              <Button
                label="View today's attendance"
                variant="outline"
                onPress={() => navigation.navigate('AttendanceSubmitted', { classId, onDate })}
              />
            ) : (
              <Button label="Mark attendance" onPress={() => navigation.navigate('MarkAttendance', { classId })} />
            )}

            {currentTerm.data ? (
              pickingSubject ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {(subjects.data ?? []).map((s) => (
                    <Button
                      key={s.subjectId}
                      label={s.name}
                      size="sm"
                      variant="outline"
                      onPress={() => {
                        setPickingSubject(false);
                        navigation.navigate('MarkEntry', { classId, subjectId: s.subjectId, termId: currentTerm.data!.id });
                      }}
                    />
                  ))}
                  <Button label="Cancel" size="sm" variant="ghost" onPress={() => setPickingSubject(false)} />
                </View>
              ) : (
                <Button label="Enter marks" variant="outline" onPress={() => setPickingSubject(true)} />
              )
            ) : null}
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
