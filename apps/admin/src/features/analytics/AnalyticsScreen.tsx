import { useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader } from '@/components';
import { semantic, spacing, typography } from '@/theme/tokens';
import { exportAttendanceSummary } from './api';
import { useCurrentTermId, useGradeNames, useSummaries } from './hooks';

export function AnalyticsScreen() {
  const termId = useCurrentTermId();
  const school = useSummaries(termId.data ?? undefined, 'school');
  const grades = useSummaries(termId.data ?? undefined, 'grade');
  const gradeNames = useGradeNames();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function doExport() {
    if (!termId.data) return;
    setExporting(true);
    setExportError(null);
    try {
      const url = await exportAttendanceSummary(termId.data);
      await Linking.openURL(url);
    } catch {
      setExportError('Could not generate the export.');
    } finally {
      setExporting(false);
    }
  }

  if (termId.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!termId.data) {
    return (
      <Screen>
        <EmptyState title="No current term" message="Summaries are computed per term once one is active." />
      </Screen>
    );
  }

  const schoolRow = school.data?.[0];

  return (
    <Screen>
      <ScreenHeader title="Analytics" subtitle="This term">
        <Button label="Export CSV" size="sm" variant="outline" loading={exporting} onPress={() => void doExport()} />
      </ScreenHeader>

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
    </Screen>
  );
}
