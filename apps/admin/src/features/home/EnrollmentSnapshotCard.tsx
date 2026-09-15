import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { EnrollmentSnapshot } from './api';

const TINT = { fg: colors.gold700, bg: colors.gold100 };

/** Home "Student enrolment" widget — total active students and the per-grade breakdown for the current year. Only rendered when there's at least one enrolled student. */
export function EnrollmentSnapshotCard({ snapshot }: { snapshot: EnrollmentSnapshot }) {
  const top = [...snapshot.gradeBreakdown].sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <WidgetTile icon="people-circle-outline" label="ENROLMENT" tint={TINT}>
      <Text style={{ ...typography.title, color: semantic.textPrimary }}>{snapshot.totalStudents}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {top.map((g) => (
          <Text key={g.gradeName} style={{ ...typography.caption, color: semantic.textSecondary }}>
            {g.gradeName}: {g.count}
          </Text>
        ))}
      </View>
    </WidgetTile>
  );
}
