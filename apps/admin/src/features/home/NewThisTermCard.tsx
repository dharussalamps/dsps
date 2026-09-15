import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { NewThisTerm } from './api';

const TINT = { fg: colors.info, bg: colors.infoBg };

/** Home "New this term" widget — students and staff added since the current term started. Only rendered when at least one of the two counts is non-zero. */
export function NewThisTermCard({ data }: { data: NewThisTerm }) {
  return (
    <WidgetTile icon="sparkles-outline" label="NEW THIS TERM" tint={TINT}>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <View>
          <Text style={{ ...typography.title, color: semantic.textPrimary }}>{data.newStudents}</Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>students</Text>
        </View>
        <View>
          <Text style={{ ...typography.title, color: semantic.textPrimary }}>{data.newStaff}</Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>staff</Text>
        </View>
      </View>
    </WidgetTile>
  );
}
