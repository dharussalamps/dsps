import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { EarlyLeaveToday } from './api';

const TINT = { fg: colors.warning, bg: colors.warningBg };

/** Home "Early leaves today" widget — school-wide, across every class the caller can see. Only rendered when there's at least one. */
export function EarlyLeaveLogCard({ earlyLeaves }: { earlyLeaves: EarlyLeaveToday[] }) {
  return (
    <WidgetTile icon="exit-outline" label="EARLY LEAVES" tint={TINT}>
      {earlyLeaves.slice(0, 2).map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {e.studentName}
          </Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{e.leftAt.slice(0, 5)}</Text>
        </View>
      ))}
      {earlyLeaves.length > 2 ? (
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>+{earlyLeaves.length - 2} more</Text>
      ) : null}
    </WidgetTile>
  );
}
