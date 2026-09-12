import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, LayoutAnimation, Platform, Pressable, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, SegmentedControl, StatusPill } from '@/components';
import { colors, elevation, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { ClassSummary } from './api';
import { deleteStudent, removeStudentFromClass, setStudentClass } from './api';
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
/** Smooths every expand/collapse and tab switch on this screen — same technique as LeaveRequestsScreen. */
function animateNext() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

/**
 * Reachable from More — the only place a student created without a class
 * (AddStudentScreen's class picker is optional) can be given one afterward,
 * the only place a class can be cleared back to unassigned, and (from the
 * Unassigned tab) the only place a student can be permanently deleted —
 * restricted to those with no class assignment and no attendance history.
 */
export function SetClassScreen() {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('unassigned');
  // Lifted here (not just inside UnassignedTab) so the Hero can show the
  // waiting count regardless of which tab is active — react-query shares
  // the cache entry with the tab's own subscription below.
  const unassigned = useUnassignedStudents();
  const waitingCount = unassigned.data?.length ?? 0;

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
          onChange={(next) => {
            animateNext();
            setTab(next);
          }}
          options={[
            { key: 'unassigned', label: 'Unassigned', icon: 'person-add-outline' },
            { key: 'enrolled', label: 'In a class', icon: 'exit-outline' },
          ]}
        />
        {tab === 'unassigned' && waitingCount > 0 ? (
          <View
            style={styles.summaryChip}
            accessible
            accessibilityLabel={`${waitingCount} ${waitingCount === 1 ? 'student' : 'students'} waiting for a class`}
          >
            <Icon name="alert-circle-outline" size={14} color={colors.warning} />
            <Text style={styles.summaryChipText}>
              {waitingCount} {waitingCount === 1 ? 'student' : 'students'} waiting for a class
            </Text>
          </View>
        ) : null}
      </Hero>
      {tab === 'unassigned' ? <UnassignedTab unassigned={unassigned} onChanged={onChanged} /> : <EnrolledTab onChanged={onChanged} />}
    </Screen>
  );
}

function UnassignedTab({ unassigned, onChanged }: { unassigned: ReturnType<typeof useUnassignedStudents>; onChanged: () => Promise<void> }) {
  const classes = useClasses();
  const grouped = useMemo(() => groupByGrade(classes.data ?? []), [classes.data]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ studentId: string; classId: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    animateNext();
    setExpandedId((current) => (current === id ? null : id));
  }

  async function assign(studentId: string, classId: string) {
    setBusy({ studentId, classId });
    try {
      await setStudentClass(studentId, classId);
      animateNext();
      setExpandedId(null);
      await onChanged();
    } catch (err) {
      Alert.alert('Could not set class', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setBusy(null);
    }
  }

  function confirmDelete(studentId: string, name: string) {
    Alert.alert(
      'Delete this student?',
      `${name}'s record will be permanently removed and cannot be recovered. This only works if they have no attendance history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void doDelete(studentId) },
      ],
    );
  }

  async function doDelete(studentId: string) {
    setDeletingId(studentId);
    try {
      await deleteStudent(studentId);
      if (expandedId === studentId) {
        animateNext();
        setExpandedId(null);
      }
      await onChanged();
    } catch (err) {
      Alert.alert('Could not delete this student', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <FlatList
      data={unassigned.data ?? []}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.listContent}
      ListEmptyComponent={
        unassigned.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <EmptyState icon="checkmark-done-outline" title="Everyone has a class" message="No unassigned students right now." />
        )
      }
      renderItem={({ item }) => {
        const displayName = item.preferredName || item.fullName;
        const expanded = expandedId === item.id;
        return (
          <Card onPress={() => toggleExpand(item.id)} flat style={StyleSheet.flatten([styles.compactCard, expanded ? styles.cardExpanded : null])}>
            <View style={styles.row}>
              <Avatar name={displayName} size={36} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name}>{displayName}</Text>
                <Text style={styles.meta}>{item.admissionNo}</Text>
              </View>
              <View style={styles.actions}>
                {!item.hasAttendance ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${displayName}`}
                    hitSlop={6}
                    disabled={deletingId === item.id}
                    onPress={() => confirmDelete(item.id, displayName)}
                    style={[styles.iconAction, styles.deleteAction]}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <Icon name="trash-outline" size={16} color={colors.error} />
                    )}
                  </Pressable>
                ) : null}
                <View style={styles.iconAction}>
                  <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={semantic.textSecondary} />
                </View>
              </View>
            </View>

            {expanded ? (
              <View style={styles.chipArea}>
                {grouped.length === 0 ? (
                  <Text style={styles.meta}>No classes have been set up yet.</Text>
                ) : (
                  grouped.map((g) => (
                    <View key={g.gradeNumber} style={{ gap: spacing.xs }}>
                      <SectionHeader icon="school-outline" label={g.gradeName.toUpperCase()} />
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
      <View style={styles.searchCard}>
        <Icon name="search-outline" size={18} color={semantic.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or admission no."
          placeholderTextColor={colors.ink300}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
            <Icon name="close-circle" size={18} color={colors.ink300} />
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={search.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const displayName = item.preferredName || item.fullName;
          return (
            <Card flat style={styles.compactCard}>
              <View style={styles.row}>
                <Avatar name={displayName} size={36} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.name}>{displayName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text style={styles.meta}>{item.admissionNo}</Text>
                    <StatusPill label={item.className} tone="gold" />
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${displayName} from ${item.className}`}
                  hitSlop={6}
                  disabled={busyId === item.id}
                  onPress={() => confirmRemove(item.id, displayName, item.className)}
                  style={[styles.iconAction, styles.deleteAction]}
                >
                  {busyId === item.id ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="exit-outline" size={16} color={colors.error} />}
                </Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          search.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : hasQuery ? (
            <EmptyState icon="search-outline" title="No matches" message="Try a different name or admission number." />
          ) : (
            <EmptyState icon="people-outline" title="Find a student" message="Search by name or admission number to remove them from their class." />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, gap: spacing.xs, flexGrow: 1 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    minHeight: minTapTarget,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...elevation.raised,
  },
  searchInput: { flex: 1, ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.sm },
  compactCard: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...typography.bodyStrong, color: semantic.textPrimary },
  meta: { ...typography.caption, color: semantic.textSecondary },
  cardExpanded: { borderColor: semantic.primary, borderWidth: 1.5, ...elevation.card },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconAction: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteAction: { backgroundColor: colors.errorBg },
  chipArea: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border, gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.warningBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  summaryChipText: { ...typography.captionStrong, color: colors.warning },
});
