import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Button, EmptyState, Hero, Icon, Screen, ScreenHeader, TextField } from '@/components';
import { useCanCreateStudents } from '@/features/accounts/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { colors, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { ClassSummary } from './api';
import { StudentListItem } from './StudentListItem';
import { useClasses, useStudentSearch, useStudentsInClasses } from './hooks';

type GradeGroup = { gradeNumber: number; gradeName: string; classes: ClassSummary[] };

function groupByGrade(classes: ClassSummary[]): GradeGroup[] {
  const groups = new Map<number, GradeGroup>();
  for (const c of classes) {
    const group = groups.get(c.gradeNumber);
    if (group) group.classes.push(c);
    else groups.set(c.gradeNumber, { gradeNumber: c.gradeNumber, gradeName: c.gradeName, classes: [c] });
  }
  return [...groups.values()].sort((a, b) => a.gradeNumber - b.gradeNumber);
}

type Scope = { kind: 'class'; id: string; name: string } | { kind: 'grade'; gradeNumber: number; name: string; classIds: string[] };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function StudentSearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const hasQuery = query.trim().length >= 2;
  const scopeClassIds = scope?.kind === 'class' ? [scope.id] : scope?.kind === 'grade' ? scope.classIds : undefined;

  const search = useStudentSearch(query, scopeClassIds);
  const roster = useStudentsInClasses(scopeClassIds);
  const classes = useClasses();
  const canCreateStudents = useCanCreateStudents();
  const gradeGroups = useMemo(() => groupByGrade(classes.data ?? []), [classes.data]);
  const classNameById = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);

  // Which class a row belongs to only needs spelling out when a grade (several classes) is in view.
  function withClassName<T extends { classId?: string }>(rows: T[]): (T & { className?: string })[] {
    return scope?.kind === 'grade' ? rows.map((r) => ({ ...r, className: r.classId ? classNameById.get(r.classId) : undefined })) : rows;
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={t('nav.students')} tone="onPrimary">
          {canCreateStudents ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add student"
              hitSlop={8}
              onPress={() => navigation.navigate('AddStudent')}
              style={styles.headerButton}
            >
              <Icon name="person-add-outline" size={22} color={colors.white} />
            </Pressable>
          ) : null}
        </ScreenHeader>
        <View style={styles.searchRow}>
          <View style={styles.scopePill}>
            <Text style={styles.scopePillLabel} numberOfLines={1}>
              {scope ? scope.name : 'All'}
            </Text>
            {scope ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear filter"
                hitSlop={8}
                onPress={() => setScope(null)}
              >
                <Icon name="close-circle" size={16} color={colors.ink300} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="Search by name or index"
              value={query}
              onChangeText={setQuery}
              onClear={() => setQuery('')}
              autoCapitalize="none"
              style={styles.searchInput}
            />
          </View>
        </View>
      </Hero>

      <View style={{ flex: 1 }}>
        {hasQuery ? (
          <FlatList
            data={withClassName(search.data ?? [])}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
            renderItem={({ item }) => (
              // Roll number isn't shown for search matches — it only makes sense read against a class roster.
              <StudentListItem
                student={{ ...item, rollNo: undefined }}
                onPress={() => navigation.navigate('StudentProfile', { studentId: item.id })}
                compact
              />
            )}
            ListEmptyComponent={
              search.isLoading ? (
                <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <EmptyState
                  title="No students found"
                  message={scope ? `Try a different name or admission number in ${scope.name}.` : 'Try a different name or admission number.'}
                />
              )
            }
          />
        ) : scope ? (
          <FlatList
            data={withClassName(roster.data ?? [])}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => (
              <StudentListItem student={item} onPress={() => navigation.navigate('StudentProfile', { studentId: item.id })} />
            )}
            ListEmptyComponent={
              roster.isLoading ? (
                <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <EmptyState title={scope.kind === 'grade' ? 'No students in this grade' : 'No students in this class'} />
              )
            }
          />
        ) : (
          <FlatList
            data={gradeGroups}
            keyExtractor={(group) => String(group.gradeNumber)}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
            ListHeaderComponent={
              <Text style={{ ...typography.captionStrong, color: semantic.textSecondary, marginBottom: spacing.sm }}>
                BROWSE BY CLASS
              </Text>
            }
            ListEmptyComponent={
              classes.isLoading ? (
                <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
              ) : (
                <EmptyState title="No classes in scope" />
              )
            }
            renderItem={({ item: group }) => (
              <View style={styles.classRow}>
                <Button
                  label={group.gradeName}
                  variant="secondary"
                  accessibilityLabel={`All students in ${group.gradeName}`}
                  onPress={() =>
                    setScope({ kind: 'grade', gradeNumber: group.gradeNumber, name: group.gradeName, classIds: group.classes.map((c) => c.id) })
                  }
                />
                {group.classes.map((c) => (
                  <Button
                    key={c.id}
                    label={c.name}
                    variant="outline"
                    style={styles.classButton}
                    onPress={() => setScope({ kind: 'class', id: c.id, name: c.name })}
                  />
                ))}
              </View>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = {
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: 118,
    minHeight: minTapTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  scopePillLabel: { ...typography.bodyStrong, color: semantic.textPrimary, flexShrink: 1 },
  searchInput: { flex: 1, backgroundColor: colors.white, borderWidth: 0 },
  classRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  classButton: { paddingHorizontal: spacing.md },
} as const;
