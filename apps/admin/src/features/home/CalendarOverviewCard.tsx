import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { CalendarOverview } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.maroon700, bg: colors.maroon100 };
const DAY_TYPE_LABEL: Record<string, string> = { holiday: 'Holiday', closure: 'Closure', half_day: 'Half day' };

/** Home "Calendar overview" widget — upcoming holidays/closures and the current term's end date. Only rendered when there's something to show. */
export function CalendarOverviewCard({ overview }: { overview: CalendarOverview }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="calendar-clear-outline" label="CALENDAR" tint={TINT} onPress={() => navigation.navigate('AcademicCalendar')}>
      {overview.currentTermEndsOn ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Term ends {overview.currentTermEndsOn.slice(5)}</Text>
      ) : null}
      {overview.upcoming.slice(0, 2).map((d) => (
        <View key={d.onDate} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {d.label ?? DAY_TYPE_LABEL[d.dayType] ?? d.dayType}
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{d.onDate.slice(5)}</Text>
        </View>
      ))}
    </WidgetTile>
  );
}
