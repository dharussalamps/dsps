import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SegmentedControl, StatusPill, TextField } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { ClassSummary } from './api';
import { removeStudentFromClass, setStudentClass } from './api';
import { useClasses, useEnrolledStudentSearch, useUnassignedStudents } from './hooks';

type Tab = 'unassigned' | 'enrolled';
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

function StudentAvatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/** Reachable from More — the only place a student created without a class (AddStudentScreen's class picker is optional) can be given one afterward, and the only place a class can be cleared back to unassigned. */
export function SetClassScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('unassigned');

  async function onChanged() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['students'] }),
      queryClient.invalidateQueries({ queryKey: ['classes'] }),
    ]);
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="school-outline" bottomIcon="people-outline" />
        <ScreenHeader title="Set class" subtitle="Assign a class, or free one up" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'unassigned', label: 'Unassigned', icon: 'person-add-outline' },
            { key: 'enrolled', label: 'In a class', icon: 'exit-outline' },
          ]}
        />
      </Hero>
      {tab === 'unassigned' ? <UnassignedTab onChanged={onChanged} /> : <EnrolledTab onChanged={onChanged} />}
    </Screen>
  );
}

function UnassignedTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const unassigned = useUnassignedStudents();
  const classes = useClasses();
  const grouped = useMemo(() => groupByGrade(classes.data ?? []), [classes.data]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ studentId: string; classId: string } | null>(null);

  async function assign(studentId: string, classId: string) {
    setBusy({ studentId, classId });
    try {
      await setStudentClass(studentId, classId);
      setExpandedId(null);
      await onChanged();
    } catch (err) {
      Alert.alert('Could not set class', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setBusy(null);
    }
  }

  const count = unassigned.data?.length ?? 0;

  return (
    <FlatList
      data={unassigned.data ?? []}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.listContent}
      ListHeaderComponent={
        count > 0 ? (
          <View style={styles.statCard}>
            <View style={styles.statIconWrap}>
              <Icon name="alert-circle" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statNumber}>{count}</Text>
              <Text style={styles.statLabel}>{count === 1 ? 'student waiting for a class' : 'students waiting for a class'}</Text>
            </View>
          </View>
        ) : null
      }
      ListEmptyComponent={
        unassigned.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <EmptyState title="Everyone has a class" message="No unassigned students right now." />
        )
      }
      renderItem={({ item }) => {
        const displayName = item.preferredName || item.fullName;
        const expanded = expandedId === item.id;
        return (
          <Card onPress={() => setExpandedId(expanded ? null : item.id)} flat style={expanded ? styles.cardExpanded : undefined}>
            <View style={styles.row}>
              <StudentAvatar name={displayName} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{displayName}</Text>
                <Text style={styles.meta}>{item.admissionNo}</Text>
              </View>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink300} />
            </View>

            {expanded ? (
              <View style={styles.chipArea}>
                {grouped.length === 0 ? (
                  <Text style={styles.meta}>No classes have been set up yet.</Text>
                ) : (
                  grouped.map((g) => (
                    <View key={g.gradeNumber} style={{ gap: spacing.xs }}>
                      <Text style={styles.gradeLabel}>{g.gradeName.toUpperCase()}</Text>
                      <View style={styles.chipRow}>
                        {g.classes.map((c) => (
                          <Button
                            key={c.id}
                            label={c.name}
                            size="sm"
                            variant="outline"
                            loading={busy?.studentId === item.id && busy.classId === c.id}
                            disabled={busy != null && (busy.studentId !== item.id || busy.classId !== c.id)}
                            onPress={() => void assign(item.id, c.id)}
                          />
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </Card>
        );
      }}
    />
  );
}

function EnrolledTab({ onChanged }: { onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const search = useEnrolledStudentSearch(query);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasQuery = query.trim().length >= 2;

  function confirmRemove(studentId: string, name: string, className: string) {
    Alert.alert('Remove from class?', `${name} will be taken out of ${className} and appear under Unassigned until given a new class.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void remove(studentId) },
    ]);
  }

  async function remove(studentId: string) {
    setBusyId(studentId);
    try {
      await removeStudentFromClass(studentId);
      await onChanged();
    } catch (err) {
      Alert.alert('Could not remove this student', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchWrap}>
        <TextField
          placeholder="Search by name or admission no."
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={search.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const displayName = item.preferredName || item.fullName;
          return (
            <Card flat>
              <View style={styles.row}>
                <StudentAvatar name={displayName} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name}>{displayName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text style={styles.meta}>{item.admissionNo}</Text>
                    <StatusPill label={item.className} tone="gold" />
                  </View>
                </View>
                <Button
                  label=""
                  accessibilityLabel={`Remove ${displayName} from ${item.className}`}
                  icon="exit-outline"
                  size="sm"
                  variant="ghost"
                  textColor={colors.error}
                  loading={busyId === item.id}
                  onPress={() => confirmRemove(item.id, displayName, item.className)}
                />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          search.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : hasQuery ? (
            <EmptyState title="No matches" message="Try a different name or admission number." />
          ) : (
            <EmptyState title="Find a student" message="Search by name or admission number to remove them from their class." />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  searchWrap: { padding: spacing.lg, paddingBottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.maroon100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.subtitle, color: colors.maroon700 },
  name: { ...typography.bodyStrong, color: semantic.textPrimary },
  meta: { ...typography.caption, color: semantic.textSecondary },
  cardExpanded: { borderColor: semantic.primary, borderWidth: 1.5 },
  chipArea: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border, gap: spacing.sm },
  gradeLabel: { ...typography.overline, color: semantic.textSecondary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.warningBg,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: { ...typography.title, color: colors.warning },
  statLabel: { ...typography.caption, color: semantic.textSecondary },
});
