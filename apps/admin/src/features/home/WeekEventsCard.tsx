import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type WeekEvent = { id: string; title: string; startsOn: string; endsOn: string | null };
const TINT = { fg: colors.gold700, bg: colors.gold100 };

/** Home "This week's events" widget — the "Today" card's events row, widened to a 7-day window. Only rendered when there's at least one. */
export function WeekEventsCard({ events }: { events: WeekEvent[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="calendar-outline" label="THIS WEEK" tint={TINT} onPress={() => navigation.navigate('EventCalendar')}>
      {events.slice(0, 2).map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {e.title}
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{e.startsOn.slice(5)}</Text>
        </View>
      ))}
    </WidgetTile>
  );
}
