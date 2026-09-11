import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, StatusPill } from '@/components';
import { reopenMarkSheet } from '@/features/marks/api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { computeExamAnalytics, computeScoreDistribution, type ScoreBand } from './api';
import { useExamDetail, useExamMarks } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ExamMarks'>;

const bandColor: Record<ScoreBand['tone'], string> = { error: colors.error, warning: colors.warning, success: colors.success };

type ScoreState = 'success' | 'warning' | 'error' | 'neutral';
const scoreAccent: Record<ScoreState, string> = { success: colors.success, warning: colors.warning, error: colors.error, neutral: colors.ink300 };

function scoreState(score: number | null, maxScore: number): ScoreState {
  if (score == null || !maxScore) return 'neutral';
  const pct = (score / maxScore) * 100;
  return pct >= 75 ? 'success' : pct >= 40 ? 'warning' : 'error';
}

export function ExamMarksScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { params } = useRoute<Route>();
  const detail = useExamDetail(params.markSheetId);
  const marks = useExamMarks(params.markSheetId, detail.data?.classId);
  const rows = marks.data ?? [];
  const analytics = computeExamAnalytics(rows);
  const distribution = computeScoreDistribution(rows, detail.data?.maxScore ?? 0);
  const maxScore = detail.data?.maxScore ?? 0;
  const maxBandCount = Math.max(1, ...distribution.map((b) => b.count));
  const [reopening, setReopening] = useState(false);

  async function doReopen() {
    setReopening(true);
    try {
      await reopenMarkSheet(params.markSheetId);
      await queryClient.invalidateQueries({ queryKey: ['exams', 'detail', params.markSheetId] });
      void queryClient.invalidateQueries({ queryKey: ['exams', 'sheets', detail.data?.classId] });
      void queryClient.invalidateQueries({ queryKey: ['marks', 'visible-sheets'] });
    } catch {
      Alert.alert('Could not reopen this exam', 'Something went wrong — try again.');
    } finally {
      setReopening(false);
    }
  }

  function confirmReopen() {
    Alert.alert(
      'Reopen this exam?',
      `${detail.data?.subjectName ?? 'This exam'} will become editable again — the class teacher will be able to change marks until it's submitted again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', onPress: () => void doReopen() },
      ],
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="book-outline" />
        <ScreenHeader
          title={detail.data ? detail.data.subjectName : 'Exam'}
          subtitle={detail.data ? `${detail.data.className} · ${detail.data.termName}` : undefined}
          tone="onPrimary"
          hideBell
          back={navigation.canGoBack()}
        >
          {detail.data ? (
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={detail.data.status === 'submitted' ? 'Locked — tap to reopen for editing' : 'Editable — tap to enter marks'}
                hitSlop={8}
                disabled={reopening}
                onPress={() =>
                  detail.data!.status === 'submitted'
                    ? confirmReopen()
                    : navigation.navigate('MarkEntry', {
                        classId: detail.data!.classId,
                        subjectId: detail.data!.subjectId,
                        termId: detail.data!.termId,
                      })
                }
                style={styles.lockButton}
              >
                {reopening ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Icon name={detail.data.status === 'submitted' ? 'lock-closed-outline' : 'create-outline'} size={18} color={colors.white} />
                )}
              </Pressable>
            </View>
          ) : null}
        </ScreenHeader>

        {detail.data?.reopenedAt && detail.data.status !== 'submitted' ? (
          <View style={styles.reopenedRow}>
            <Icon name="time-outline" size={13} color={colors.cream100} />
            <Text style={styles.reopenedLabel}>Reopened {format(parseISO(detail.data.reopenedAt), 'd MMM, h:mm a')}</Text>
          </View>
        ) : null}
      </Hero>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.studentId}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          detail.data ? (
            <Card style={{ marginBottom: spacing.md }}>
              <SectionHeader icon="analytics-outline" label="ANALYTICS REPORT CARD" />

              <View style={styles.averageBlock}>
                <View style={{ gap: 2 }}>
                  <Text style={styles.averageLabel}>Class average</Text>
                  <Text style={styles.averageValue}>{analytics.average != null ? `${analytics.average}` : '—'}<Text style={styles.averageOutOf}> / {maxScore}</Text></Text>
                </View>
                <View style={styles.averageBadge}>
                  <Icon name="people-outline" size={13} color={colors.white} />
                  <Text style={styles.averageBadgeText}>
                    {analytics.enteredCount} of {analytics.rosterCount} marked
                  </Text>
                </View>
              </View>

              <View style={styles.chipRow}>
                <StatChip icon="trophy" label={analytics.topStudentName ?? 'Highest'} value={analytics.highest} color={colors.success} bg={colors.successBg} />
                <StatChip icon="trending-down" label={analytics.bottomStudentName ?? 'Lowest'} value={analytics.lowest} color={colors.error} bg={colors.errorBg} />
              </View>

              {analytics.enteredCount > 0 ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                  <Text style={styles.distributionLabel}>SCORE DISTRIBUTION</Text>
                  <View style={styles.distributionRow}>
                    {distribution.map((band) => (
                      <View key={band.label} style={styles.distributionCol}>
                        <View style={styles.distributionTrack}>
                          <View
                            style={[
                              styles.distributionFill,
                              { height: `${Math.max(band.count > 0 ? 10 : 3, Math.round((band.count / maxBandCount) * 100))}%`, backgroundColor: bandColor[band.tone] },
                            ]}
                          />
                        </View>
                        <Text style={styles.distributionCount}>{band.count}</Text>
                        <Text style={styles.distributionRange}>{band.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </Card>
          ) : null
        }
        ListEmptyComponent={
          marks.isLoading || detail.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No students in this class" />
          )
        }
        renderItem={({ item, index }) => {
          const state = scoreState(item.score, maxScore);
          return (
            <Card flat style={styles.studentRow}>
              <View style={[styles.rowAccent, { backgroundColor: scoreAccent[state] }]} />
              <View style={styles.indexBadge}>
                <Text style={styles.indexBadgeText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ ...typography.body, color: semantic.textPrimary }}>{item.fullName}</Text>
                <View style={styles.admissionRow}>
                  <Icon name="finger-print-outline" size={12} color={semantic.textSecondary} />
                  <Text style={styles.admissionLabel}>{item.admissionNo}</Text>
                </View>
              </View>
              <StatusPill label={item.score != null ? `${item.score}/${maxScore}` : 'Not entered'} tone={state} />
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function StatChip({ icon, label, value, color, bg }: { icon: 'trophy' | 'trending-down'; label: string; value: number | null; color: string; bg: string }) {
  return (
    <View style={[styles.statChip, { backgroundColor: bg }]}>
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.statChipValue, { color }]}>{value ?? '—'}</Text>
      <Text style={[styles.statChipLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  reopenedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -spacing.xs },
  reopenedLabel: { ...typography.caption, color: colors.cream100 },
  averageBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: semantic.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  averageLabel: { ...typography.caption, color: colors.cream100 },
  averageValue: { ...typography.display, color: colors.white },
  averageOutOf: { ...typography.subtitle, color: colors.cream100 },
  averageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  averageBadgeText: { ...typography.captionStrong, color: colors.white },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statChip: { flex: 1, alignItems: 'center', gap: 2, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  statChipValue: { ...typography.subtitle },
  statChipLabel: { ...typography.caption, fontWeight: '600', textAlign: 'center' },
  distributionLabel: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  distributionRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.sm },
  distributionCol: { alignItems: 'center', gap: 4, flex: 1 },
  distributionTrack: {
    width: 26,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: semantic.surfaceAlt,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  distributionFill: { width: '100%', borderRadius: radius.sm },
  distributionCount: { ...typography.captionStrong, color: semantic.textPrimary },
  distributionRange: { ...typography.caption, color: semantic.textSecondary, fontSize: 10 },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowAccent: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: { ...typography.captionStrong, color: semantic.primary, fontSize: 12 },
  admissionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  admissionLabel: { ...typography.caption, color: semantic.textSecondary },
});
