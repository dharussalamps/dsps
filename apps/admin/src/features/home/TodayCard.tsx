import { Text } from 'react-native';
import { WidgetTile } from '@/components';
import { colors, semantic, typography } from '@/theme/tokens';

type Duty = { id: string; title: string; scheduleNote: string | null };
type EventRow = { id: string; title: string };

const TINT = { fg: colors.gold700, bg: colors.gold100 };

/** Home "Today" widget — your duties and today's events. Only rendered by HomeScreen when there's at least one of either. */
export function TodayCard({ duties, events }: { duties: Duty[]; events: EventRow[] }) {
  return (
    <WidgetTile icon="today-outline" label="TODAY" tint={TINT}>
      {duties.slice(0, 2).map((d) => (
        <Text key={d.id} style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={1}>
          {d.title}
          {d.scheduleNote ? ` · ${d.scheduleNote}` : ''}
        </Text>
      ))}
      {events.slice(0, 2).map((e) => (
        <Text key={e.id} style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={1}>
          📅 {e.title}
        </Text>
      ))}
    </WidgetTile>
  );
}
