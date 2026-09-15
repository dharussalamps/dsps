import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { WidgetTile } from '@/components';
import type { Announcement } from '@/features/announcements/api';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const TINT = { fg: colors.info, bg: colors.infoBg };

/** Home "Recent announcements" widget — only rendered by HomeScreen when there's at least one. */
export function AnnouncementsFeedCard({ announcements }: { announcements: Announcement[] }) {
  const navigation = useNavigation<Nav>();
  const unread = announcements.filter((a) => !a.isRead).length;

  return (
    <WidgetTile
      icon="megaphone-outline"
      label="ANNOUNCEMENTS"
      tint={TINT}
      onPress={() => navigation.navigate('Announcements')}
      accessory={unread > 0 ? <View style={styles.dot} /> : undefined}
    >
      {announcements.slice(0, 2).map((a) => (
        <Text key={a.id} style={{ ...typography.caption, color: a.isRead ? semantic.textSecondary : semantic.textPrimary }} numberOfLines={1}>
          {a.title}
        </Text>
      ))}
    </WidgetTile>
  );
}

const styles = StyleSheet.create({ dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error } });
