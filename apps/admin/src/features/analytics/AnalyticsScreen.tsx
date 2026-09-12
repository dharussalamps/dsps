import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, SegmentedControl, StatusPill } from '@/components';
import type { PillTone } from '@/components';
import { useAcademicYears, useTermsForYear } from '@/features/calendar/hooks';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { exportAttendanceSummary, exportMarksSummary, fetchStudentsAtRisk } from './api';
import { useCurrentTermId, useGradeNames, useSummaries } from './hooks';

type Tone = 'success' | 'warning' | 'error';

function attendanceTone(pct: number): Tone {
  if (pct >= 90) return 'success';
  if (pct >= 75) return 'warning';
  return 'error';
}

const toneColor: Record<Tone, { fg: string; bg: string }> = {
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  error: { fg: colors.error, bg: colors.errorBg },
};

const toneLabel: Record<Tone, string> = { success: 'On track', warning: 'Needs attention', error: 'Critical' };
const tonePill: Record<Tone, PillTone> = { success: 'success', warning: 'warning', error: 'error' };

/** Thin rounded track + fill used everywhere an attendance percentage needs a glanceable visual, not just a number. */
function AttendanceBar({ pct }: { pct: number }) {
  const tone = attendanceTone(pct);
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, pct))}%`, backgroundColor: toneColor[tone].fg }]} />
    </View>
  );
}

export function AnalyticsScreen() {
  const navigation = useNavigation();
  const years = useAcademicYears();
  const currentTermId = useCurrentTermId();
  const [pickedYearId, setPickedYearId] = useState<string | undefined>(undefined);
  const [pickedTermId, setPickedTermId] = useState<string | undefined>(undefined);

  // Defaults to the current year until the user picks a different one — derived inline so there's
  // no render-then-setState round trip while the years query is still loading.
  const yearId = pickedYearId ?? years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id;
  const terms = useTermsForYear(yearId);

  // Defaults to the current term when it belongs to the selected year, otherwise the year's most
  // recent term — so switching to a past year lands on something with data instead of nothing.
  const termId =
    pickedTermId ??
    (terms.data?.some((t) => t.id === currentTermId.data) ? currentTermId.data ?? undefined : terms.data?.[terms.data.length - 1]?.id);
  const isCurrentTerm = !!termId && termId === currentTermId.data;

  const school = useSummaries(termId, 'school');
  const grades = useSummaries(termId, 'grade');
  const gradeNames = useGradeNames();
  const atRisk = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: fetchStudentsAtRisk, enabled: isCurrentTerm });
  const [exporting, setExporting] = useState<'attendance' | 'marks' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  function pickYear(id: string) {
    setPickedYearId(id);
    setPickedTermId(undefined);
  }

  async function doExport(kind: 'attendance' | 'marks') {
    if (!termId) return;
    setExporting(kind);
    setExportError(null);
    try {
      const url = kind === 'attendance' ? await exportAttendanceSummary(termId) : await exportMarksSummary(termId);
      await Linking.openURL(url);
    } catch {
      setExportError('Could not generate the export.');
    } finally {
      setExporting(null);
    }
  }

  const selectedYear = years.data?.find((y) => y.id === yearId);
  const selectedTerm = terms.data?.find((t) => t.id === termId);
  const subtitle = selectedTerm && selectedYear ? `${selectedTerm.name} · ${selectedYear.label}` : undefined;

  const yearPicker =
    years.data && years.data.length > 0 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {years.data.map((y) => {
          const active = y.id === yearId;
          return (
            <Pressable
              key={y.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => pickYear(y.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Icon name="calendar-outline" size={14} color={active ? semantic.primary : colors.white} />
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{y.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  const termPicker =
    terms.data && terms.data.length > 0 && termId ? (
      <SegmentedControl value={termId} onChange={setPickedTermId} options={terms.data.map((t) => ({ key: t.id, label: t.name }))} />
    ) : null;

  if (years.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="stats-chart-outline" bottomIcon="trending-up-outline" />
          <ScreenHeader title="Analytics" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!yearId) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="stats-chart-outline" bottomIcon="trending-up-outline" />
          <ScreenHeader title="Analytics" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState icon="stats-chart-outline" title="No academic year defined" message="Set up an academic year in Settings to start tracking analytics." />
        </View>
      </Screen>
    );
  }

  const schoolRow = school.data?.[0];
  const schoolTone = schoolRow ? attendanceTone(schoolRow.pct) : null;
  const sortedGrades = [...(grades.data ?? [])].sort((a, b) => b.pct - a.pct);
  const atRiskCount = atRisk.data?.length ?? 0;

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="stats-chart-outline" bottomIcon="trending-up-outline" />
        <ScreenHeader title="Analytics" subtitle={subtitle} tone="onPrimary" back={navigation.canGoBack()} hideBell />
        {yearPicker}
        {termPicker}
      </Hero>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl + 64 }}>
        {exportError ? <Text style={{ ...typography.caption, color: colors.error }}>{exportError}</Text> : null}

        {terms.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : !termId ? (
          <EmptyState icon="calendar-outline" title="No terms in this year" message="Add a term for this academic year in Settings." />
        ) : (
          <>
            <Card style={styles.heroCard}>
              <View style={styles.heroCardTop}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.eyebrow}>SCHOOL-WIDE ATTENDANCE</Text>
                  {schoolRow ? (
                    <Text style={{ ...typography.display, color: semantic.textPrimary }}>{schoolRow.pct}%</Text>
                  ) : (
                    <Text style={{ ...typography.body, color: semantic.textSecondary, marginTop: spacing.xs }}>
                      {isCurrentTerm ? 'Not yet computed — runs nightly.' : 'No summary computed for this term.'}
                    </Text>
                  )}
                  {schoolRow ? (
                    <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                      {schoolRow.presentDays} of {schoolRow.schoolDays} school days present
                    </Text>
                  ) : null}
                </View>
                {schoolTone ? <StatusPill label={toneLabel[schoolTone]} tone={tonePill[schoolTone]} /> : null}
              </View>
              {schoolRow ? <AttendanceBar pct={schoolRow.pct} /> : null}
            </Card>

            <View style={styles.statRow}>
              <Card flat style={styles.statTile}>
                <View style={styles.statIconChip}>
                  <Icon name="layers-outline" size={16} color={semantic.primary} />
                </View>
                <Text style={{ ...typography.title, color: semantic.textPrimary }}>{grades.data?.length ?? 0}</Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Grades tracked</Text>
              </Card>
              <Card flat style={styles.statTile}>
                <View style={[styles.statIconChip, atRiskCount > 0 && { backgroundColor: colors.errorBg }]}>
                  <Icon name="alert-circle-outline" size={16} color={atRiskCount > 0 ? colors.error : semantic.primary} />
                </View>
                <Text style={{ ...typography.title, color: atRiskCount > 0 ? colors.error : semantic.textPrimary }}>{isCurrentTerm ? atRiskCount : '—'}</Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Students at risk</Text>
              </Card>
            </View>

            <View style={{ gap: spacing.sm }}>
              <SectionHeader
                icon="bar-chart-outline"
                label="BY GRADE"
                accessory={sortedGrades.length ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{sortedGrades.length} grades</Text> : undefined}
              />
              {sortedGrades.map((g) => {
                const tone = attendanceTone(g.pct);
                return (
                  <Card key={g.scopeId} flat style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ ...typography.body, color: semantic.textPrimary }}>{gradeNames.data?.[g.scopeId ?? ''] ?? 'Grade'}</Text>
                      <Text style={{ ...typography.bodyStrong, color: toneColor[tone].fg }}>{g.pct}%</Text>
                    </View>
                    <AttendanceBar pct={g.pct} />
                  </Card>
                );
              })}
              {grades.data && grades.data.length === 0 ? <EmptyState title="No grade summaries yet" /> : null}
            </View>

            {/* FR-ANL-02: "students at risk by consecutive absence or low attendance are listed, most severe first." Only meaningful for the current term — the underlying RPC reports who is at risk right now, not historically. */}
            {isCurrentTerm && atRisk.data ? (
              <View style={{ gap: spacing.sm }}>
                <SectionHeader
                  icon="warning-outline"
                  label="STUDENTS AT RISK"
                  accessory={atRiskCount > 0 ? <Text style={{ ...typography.captionStrong, color: colors.error }}>{atRiskCount}</Text> : undefined}
                />
                {atRiskCount === 0 ? <EmptyState icon="checkmark-circle-outline" title="No students at risk" message="Everyone is attending well this term." /> : null}
                {atRisk.data.map((s) => (
                  <Card
                    key={s.studentId}
                    style={{ ...styles.riskCard, borderLeftColor: s.consecutiveAbsentDays > 0 ? colors.error : colors.warning }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <Avatar name={s.fullName} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{s.fullName}</Text>
                        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{s.className}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {s.consecutiveAbsentDays > 0 ? <StatusPill label={`${s.consecutiveAbsentDays} days in a row`} tone="error" /> : null}
                        <StatusPill label={`${s.termPct}% this term`} tone="warning" />
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Attendance" icon="download-outline" variant="secondary" style={{ flex: 1 }} disabled={!termId} loading={exporting === 'attendance'} onPress={() => void doExport('attendance')} />
        <Button label="Marks" icon="download-outline" variant="secondary" style={{ flex: 1 }} disabled={!termId} loading={exporting === 'marks'} onPress={() => void doExport('marks')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  heroCard: { gap: spacing.md },
  heroCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: semantic.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statTile: { flex: 1, alignItems: 'flex-start', gap: 4 },
  statIconChip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskCard: { borderLeftWidth: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...elevation.raised,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  chipActive: { backgroundColor: colors.white },
  chipLabel: { ...typography.captionStrong, color: colors.white },
  chipLabelActive: { color: semantic.primary },
});
