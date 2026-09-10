import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useUnreadNotificationCount } from '@/features/notifications/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon } from './Icon';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
  /** Renders a hamburger button before the title that opens the caller's drawer. */
  onMenuPress?: () => void;
  /** Renders a back-chevron before the title that pops the current screen. Ignored if onMenuPress is set. */
  back?: boolean;
  /** Use 'onPrimary' when the header is placed over a colored (non-cream) background — e.g. inside a Hero. */
  tone?: 'default' | 'onPrimary';
  /** Opt out of FR-ANN-06's bell for a screen that's already about picking a specific date/record, not a place someone reads notifications from (e.g. MarkStaffAttendance). Defaults to shown. */
  hideBell?: boolean;
}>;

/**
 * Page-level heading used at the top of a Screen's scroll content. Every
 * screen in the app renders one, which is what makes the notification bell
 * here satisfy FR-ANN-06 ("reachable from every screen by a single control
 * that indicates unread items") without each screen wiring it up itself.
 */
export function ScreenHeader({ title, subtitle, onMenuPress, back, children, tone = 'default', hideBell }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const unread = useUnreadNotificationCount();
  const count = unread.data ?? 0;
  const onPrimary = tone === 'onPrimary';
  const textColor = onPrimary ? colors.white : semantic.textPrimary;
  const subtitleColor = onPrimary ? colors.cream100 : semantic.textSecondary;

  return (
    <View style={styles.row}>
      {onMenuPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={8} onPress={onMenuPress} style={styles.menu}>
          <Icon name="menu-outline" size={24} color={textColor} />
        </Pressable>
      ) : back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={styles.menu}
        >
          <Icon name="chevron-back" size={26} color={textColor} />
        </Pressable>
      ) : null}
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actionsRow}>
        {children ? <View style={styles.action}>{children}</View> : null}
        {hideBell ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
            hitSlop={8}
            onPress={() => navigation.navigate('Notifications')}
            style={styles.bell}
          >
            <Icon name="notifications-outline" size={22} color={textColor} />
            {count > 0 ? (
              <View style={[styles.badge, onPrimary && styles.badgeOnPrimary]}>
                <Text style={[styles.badgeText, onPrimary && styles.badgeTextOnPrimary]}>{count > 9 ? '9+' : count}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  textCol: { flex: 1, gap: 2 },
  title: { ...typography.title },
  subtitle: { ...typography.body },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: { paddingTop: 2 },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  badgeOnPrimary: { backgroundColor: colors.white },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
  badgeTextOnPrimary: { color: colors.maroon700 },
});
