import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, StatusPill, type PillTone } from '@/components';
import { useAcademicYears } from '@/features/calendar/hooks';
import { YearChip } from '@/features/calendar/YearChip';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { ExamCard, YearClass } from './api';
import { useClassRosterCount, useClassesForYear, useExamsForClass } from './hooks';
import { NewExamModal } from './NewExamModal';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const statusTone: Record<string, PillTone> = { draft: 'gold', submitted: 'success', reopened: 'warning' };
const statusAccent: Record<string, string> = { draft: colors.gold500, submitted: colors.success, reopened: colors.warning };

type GradeSection = { title: string; gradeNumber: number; data: YearClass[] };

/** Same grouping shape StudentSearchScreen/SetClassScreen already use for their own class pickers — kept local since each screen's row rendering differs. */
function groupByGrade(classes: YearClass[]): GradeSection[] {
  const groups = new Map<number, GradeSection>();
  for (const c of classes) {
    const group = groups.get(c.gradeNumber);
    if (group) group.data.push(c);
    else groups.set(c.gradeNumber, { title: c.gradeName, gradeNumber: c.gradeNumber, data: [c] });
  }
  return [...groups.values()].sort((a, b) => a.gradeNumber - b.gradeNumber);
}

export function ExamsScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const years = useAcademicYears();
  const [pickedYearId, setPickedYearId] = useState<string | undefined>(undefined);
  const [classId, setClassId] = useState<string | undefined>(undefined);
  const [creatingExam, setCreatingExam] = useState(false);

  // Defaults to the current year until the user picks a different one — derived inline so there's
  // no render-then-setState round trip while the years query is still loading.
  const yearId = pickedYearId ?? years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id;

  const classes = useClassesForYear(yearId);
  const gradeSections = useMemo(() => groupByGrade(classes.data ?? []), [classes.data]);
  const selectedClass = classes.data?.find((c) => c.id === classId);
  const exams = useExamsForClass(classId);
  const roster = useClassRosterCount(classId);

  const totalExams = classes.data?.reduce((sum, c) => sum + c.examCount, 0) ?? 0;
  const submittedCount = exams.data?.filter((e) => e.status === 'submitted').length ?? 0;
  const draftCount = exams.data?.filter((e) => e.status !== 'submitted').length ?? 0;

  function pickYear(id: string) {
    setPickedYearId(id);
    setClassId(undefined);
  }

  function handleExamCreated(markSheetId: string) {
    setCreatingExam(false);
    void queryClient.invalidateQueries({ queryKey: ['exams', 'sheets', classId] });
    void queryClient.invalidateQueries({ queryKey: ['exams', 'classes', yearId] });
    navigation.navigate('ExamMarks', { markSheetId });
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="book-outline" />
        <ScreenHeader
          title="Exams & marks"
          subtitle={selectedClass ? `${selectedClass.gradeName} · ${selectedClass.name}` : 'Pick a year to browse classes'}
          tone="onPrimary"
          hideBell
          back={navigation.canGoBack()}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {(years.data ?? []).map((y) => (
            <YearChip key={y.id} year={y} active={y.id === yearId} onPress={() => pickYear(y.id)} />
          ))}
        </ScrollView>

        {!classId ? (
          <View style={styles.heroStatsRow}>
            <HeroStat value={classes.data?.length ?? 0} label="Classes" />
            <View style={styles.heroStatDivider} />
            <HeroStat value={totalExams} label="Exams held" />
          </View>
        ) : (
          <View style={styles.heroStatsRow}>
            <HeroStat value={exams.data?.length ?? 0} label="Exams" />
            <View style={styles.heroStatDivider} />
            <HeroStat value={submittedCount} label="Submitted" />
            <View style={styles.heroStatDivider} />
            <HeroStat value={draftCount} label="In progress" />
          </View>
        )}
      </Hero>

      {classId ? (
        <View style={styles.backRow}>
          <Pressable accessibilityRole="button" onPress={() => setClassId(undefined)} style={styles.backLink} hitSlop={8}>
            <Icon name="chevron-back" size={16} color={semantic.primary} />
            <Text style={styles.backLabel}>All classes</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setCreatingExam(true)} style={styles.newExamButton} hitSlop={8}>
            <Icon name="add-circle" size={16} color={semantic.primary} />
            <Text style={styles.newExamLabel}>New exam</Text>
          </Pressable>
        </View>
      ) : null}

      {classId ? (
        <NewExamModal
          visible={creatingExam}
          classId={classId}
          yearId={yearId}
          onClose={() => setCreatingExam(false)}
          onCreated={handleExamCreated}
        />
      ) : null}

      {!classId ? (
        <SectionList
          sections={gradeSections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          ListEmptyComponent={
            classes.isLoading ? (
              <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <EmptyState title="No classes for this year" />
            )
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderLabel}>{section.title}</Text>
              <View style={styles.sectionHeaderLine} />
              <Text style={styles.sectionHeaderCount}>
                {section.data.length} {section.data.length === 1 ? 'class' : 'classes'}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Card onPress={() => setClassId(item.id)} style={styles.classCard}>
              <Avatar name={item.name} size={34} />
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }}>{item.name}</Text>
              <View style={styles.examCountBadge}>
                <Text style={styles.examCountValue} numberOfLines={1}>
                  {item.examCount} {item.examCount === 1 ? 'exam' : 'exams'}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.ink300} />
            </Card>
          )}
        />
      ) : (
        <FlatList
          data={exams.data ?? []}
          keyExtractor={(item) => item.markSheetId}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}
          ListEmptyComponent={
            exams.isLoading ? (
              <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
            ) : (
              <EmptyState title="No exams for this class" message="A mark sheet appears here once a teacher starts entering marks." />
            )
          }
          renderItem={({ item }) => <ExamCardRow item={item} rosterCount={roster.data} onPress={() => navigation.navigate('ExamMarks', { markSheetId: item.markSheetId })} />}
        />
      )}
    </Screen>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function ExamCardRow({ item, rosterCount, onPress }: { item: ExamCard; rosterCount: number | undefined; onPress: () => void }) {
  const total = rosterCount ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((item.enteredCount / total) * 100)) : 0;

  return (
    <Card flat onPress={onPress} style={styles.examCard}>
      <View style={[styles.examAccent, { backgroundColor: statusAccent[item.status] }]} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 2, flex: 1 }}>
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.subjectName}</Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.termName} · Out of {item.maxScore}</Text>
          </View>
          <StatusPill label={item.status} tone={statusTone[item.status]} />
        </View>
        {total > 0 ? (
          <View style={{ gap: 4 }}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: statusAccent[item.status] }]} />
            </View>
            <Text style={styles.progressLabel}>
              {item.enteredCount} of {total} marked
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)' },
  heroStatValue: { ...typography.subtitle, color: colors.white },
  heroStatLabel: { ...typography.caption, color: colors.cream100 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { ...typography.bodyStrong, color: semantic.primary },
  newExamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
  },
  newExamLabel: { ...typography.captionStrong, color: semantic.primary },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionHeaderLabel: { ...typography.captionStrong, color: semantic.primary, letterSpacing: 0.4 },
  sectionHeaderLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: semantic.border },
  sectionHeaderCount: { ...typography.caption, color: semantic.textSecondary },
  classCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  examCountBadge: { backgroundColor: semantic.primaryMuted, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  examCountValue: { ...typography.captionStrong, color: semantic.primary },
  examCard: { flexDirection: 'row', gap: spacing.md, overflow: 'hidden' },
  examAccent: { width: 4, borderRadius: radius.pill },
  progressTrack: { height: 6, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressLabel: { ...typography.caption, color: semantic.textSecondary },
});
