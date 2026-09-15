import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text } from 'react-native';
import { WidgetTile } from '@/components';
import type { AuditEntry } from '@/features/accounts/api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' };

/** Home "Recent audit activity" widget — the last few entries, for admins who monitor this often. Only rendered when there's at least one. */
export function AuditActivityCard({ entries }: { entries: AuditEntry[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="shield-checkmark-outline" label="AUDIT LOG" tint={TINT} onPress={() => navigation.navigate('AuditLog')}>
      {entries.slice(0, 2).map((e) => (
        <Text key={e.id} style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={1}>
          {e.actorName ?? 'System'} {e.action} {e.entity}
        </Text>
      ))}
    </WidgetTile>
  );
}
