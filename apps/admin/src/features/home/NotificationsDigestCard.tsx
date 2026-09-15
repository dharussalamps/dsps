import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Text } from 'react-native';
import { WidgetTile } from '@/components';
import type { NotificationRow } from '@/features/notifications/api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' };

/** Home "Notifications digest" widget — the most recent few, not just the unread badge. Only rendered when there's at least one. */
export function NotificationsDigestCard({ notifications }: { notifications: NotificationRow[] }) {
  const navigation = useNavigation<Nav>();

  return (
    <WidgetTile icon="notifications-outline" label="NOTIFICATIONS" tint={TINT} onPress={() => navigation.navigate('Notifications')}>
      {notifications.slice(0, 2).map((n) => (
        <Text key={n.id} style={{ ...typography.caption, color: n.readAt ? semantic.textSecondary : semantic.textPrimary }} numberOfLines={1}>
          {n.title}
        </Text>
      ))}
    </WidgetTile>
  );
}
