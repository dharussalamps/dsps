import { format, parseISO } from 'date-fns';
import { StyleSheet, Text, View } from 'react-native';
import { radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = {
  /** YYYY-MM-DD */
  iso: string;
  size?: 'sm' | 'lg';
};

/** Calendar-page badge (month abbreviation over a big day number) used anywhere an event's start
 * date needs a glanceable visual anchor — the list row and the detail header. */
export function DateTile({ iso, size = 'sm' }: Props) {
  const date = parseISO(iso);
  const lg = size === 'lg';
  return (
    <View style={[styles.tile, lg && styles.tileLg]}>
      <Text style={[styles.month, lg && styles.monthLg]}>{format(date, 'MMM').toUpperCase()}</Text>
      <Text style={[styles.day, lg && styles.dayLg]}>{format(date, 'd')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  tileLg: { width: 64, height: 64, borderRadius: radius.lg },
  month: { ...typography.overline, fontSize: 10, color: semantic.primary },
  monthLg: { fontSize: 12 },
  day: { ...typography.subtitle, color: semantic.primary, lineHeight: 20 },
  dayLg: { fontSize: 26, lineHeight: 30, fontWeight: '700' },
});
