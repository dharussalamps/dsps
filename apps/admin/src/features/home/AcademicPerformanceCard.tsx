import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { AcademicPerformanceSummary } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.gold700, bg: colors.gold100 };

/** Home "Academic performance" widget — hidden by HomeScreen whenever avgPct is null (caller can see no marks this term). */
export function AcademicPerformanceCard({ summary }: { summary: AcademicPerformanceSummary }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="school-outline" label="PERFORMANCE" tint={TINT} onPress={() => navigation.navigate('Analytics')}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <Text style={{ ...typography.title, color: semantic.textPrimary }}>{summary.avgPct}%</Text>
        <Text style={{ ...typography.caption, color: semantic.textSecondary, paddingBottom: 3 }}>term avg</Text>
      </View>
      {summary.atRiskCount > 0 ? (
        <Text style={{ ...typography.caption, color: colors.warning }}>{summary.atRiskCount} need attention</Text>
      ) : null}
    </WidgetTile>
  );
}
