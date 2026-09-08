import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUnreadNotificationCount } from '@/features/notifications/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

/**
 * Page-level heading used at the top of a Screen's scroll content. Every
 * screen in the app renders one, which is what makes the notification bell
 * here satisfy FR-ANN-06 ("reachable from every screen by a single control
 * that indicates unread items") without each screen wiring it up itself.
 */
export function ScreenHeader({ title, subtitle, children }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unread = useUnreadNotificationCount();
  const count = unread.data ?? 0;

  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actionsRow}>
        {children ? <View style={styles.action}>{children}</View> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
          hitSlop={8}
          onPress={() => navigation.navigate('Notifications')}
          style={styles.bell}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {count > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  textCol: { flex: 1, gap: 2 },
  title: { ...typography.display, color: semantic.textPrimary },
  subtitle: { ...typography.body, color: semantic.textSecondary },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { paddingTop: 2 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.maroon700,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
});
