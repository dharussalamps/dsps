import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing, typography } from '@/theme/tokens';
import type { UpcomingCoverAssignment } from './api';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' };

/** Home "Cover assignments" widget — active today or starting within a week. Only rendered when there's at least one. */
export function CoverAssignmentsCard({ assignments }: { assignments: UpcomingCoverAssignment[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="swap-horizontal-outline" label="COVER" tint={TINT} onPress={() => navigation.navigate('AssignCover', undefined)}>
      {assignments.slice(0, 2).map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }}>
          <Text style={{ ...typography.caption, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {a.className} — {a.staffName}
          </Text>
        </View>
      ))}
    </WidgetTile>
  );
}
