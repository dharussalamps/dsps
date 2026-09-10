import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill } from '@/components';
import { semantic, spacing, typography } from '@/theme/tokens';
import { exportAttendanceSummary, exportMarksSummary, fetchStudentsAtRisk } from './api';
import { useCurrentTermId, useGradeNames, useSummaries } from './hooks';

export function AnalyticsScreen() {
  const navigation = useNavigation();
  const termId = useCurrentTermId();
  const school = useSummaries(termId.data ?? undefined, 'school');
  const grades = useSummaries(termId.data ?? undefined, 'grade');
  const gradeNames = useGradeNames();
  const atRisk = useQuery({ queryKey: ['analytics', 'at-risk'], queryFn: fetchStudentsAtRisk });
  const [exporting, setExporting] = useState<'attendance' | 'marks' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function doExport(kind: 'attendance' | 'marks') {
    if (!termId.data) return;
    setExporting(kind);
    setExportError(null);
    try {
      const url = kind === 'attendance' ? await exportAttendanceSummary(termId.data) : await exportMarksSummary(termId.data);
      await Linking.openURL(url);
    } catch {
      setExportError('Could not generate the export.');
    } finally {
      setExporting(null);
    }
  }

  if (termId.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Analytics" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!termId.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Analytics" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="No current term" message="Summaries are computed per term once one is active." />
        </View>
      </Screen>
    );
  }

  const schoolRow = school.data?.[0];

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Analytics" subtitle="This term" tone="onPrimary" back={navigation.canGoBack()}>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Attendance" icon="download-outline" size="sm" variant="secondary" loading={exporting === 'attendance'} onPress={() => void doExport('attendance')} />
            <Button label="Marks" icon="download-outline" size="sm" variant="secondary" loading={exporting === 'marks'} onPress={() => void doExport('marks')} />
          </View>
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      {exportError ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{exportError}</Text> : null}

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>SCHOOL-WIDE ATTENDANCE</Text>
        {schoolRow ? (
          <Text style={{ ...typography.display, color: semantic.textPrimary }}>{schoolRow.pct}%</Text>
        ) : (
          <Text style={{ ...typography.body, color: semantic.textSecondary }}>Not yet computed — runs nightly.</Text>
        )}
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>BY GRADE</Text>
        {(grades.data ?? []).map((g) => (
          <Card key={g.scopeId} flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>{gradeNames.data?.[g.scopeId ?? ''] ?? 'Grade'}</Text>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{g.pct}%</Text>
            </View>
          </Card>
        ))}
        {grades.data && grades.data.length === 0 ? <EmptyState title="No grade summaries yet" /> : null}
      </View>

      {/* FR-ANL-02: "students at risk by consecutive absence or low attendance are listed, most severe first." */}
      {atRisk.data && atRisk.data.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>STUDENTS AT RISK</Text>
          {atRisk.data.map((s) => (
            <Card key={s.studentId} flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{s.fullName}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{s.className}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {s.consecutiveAbsentDays > 0 ? <StatusPill label={`${s.consecutiveAbsentDays} days in a row`} tone="error" /> : null}
                  <StatusPill label={`${s.termPct}% this term`} tone="warning" />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
      </View>
    </Screen>
  );
}
