import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Pressable, Text, View } from 'react-native';
import { Button, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { markAllNotificationsRead, markNotificationRead, type NotificationRow } from './api';
import { useMyNotifications } from './hooks';

/**
 * Section 7/8's scheduled jobs and RPCs write `notifications` rows for
 * everything the SRS calls "notified" — unmarked classes, absence risk,
 * leave decisions/requests, cover assignments, event reminders, low stock,
 * announcements. None of it was ever readable from the app: this is that
 * screen, the in-app fallback section 9's own build notes assumed existed
 * ("these jobs write rows to the in-app notification center").
 */
export function NotificationsScreen() {
  const navigation = useNavigation();
  const notifications = useMyNotifications();
  const queryClient = useQueryClient();

  async function markRead(n: NotificationRow) {
    if (n.readAt) return;
    await markNotificationRead(n.id);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  async function markAll() {
    await markAllNotificationsRead();
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const hasUnread = (notifications.data ?? []).some((n) => !n.readAt);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="notifications-outline" bottomIcon="mail-outline" />
        <ScreenHeader title="Notifications" tone="onPrimary" back={navigation.canGoBack()}>
          {hasUnread ? <Button label="Mark all read" size="sm" variant="secondary" onPress={() => void markAll()} /> : null}
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>

      {notifications.data && notifications.data.length === 0 ? (
        <EmptyState title="Nothing yet" message="Reminders, leave decisions, and other alerts will appear here." />
      ) : null}

      {(notifications.data ?? []).map((n) => (
        <Pressable key={n.id} onPress={() => void markRead(n)} style={{ marginBottom: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              gap: spacing.sm,
              padding: spacing.md,
              borderRadius: radius.md,
              backgroundColor: n.readAt ? semantic.surface : semantic.primaryMuted,
              borderWidth: 1,
              borderColor: semantic.border,
            }}
          >
            {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.maroon700, marginTop: 6 }} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{n.title}</Text>
              {n.body ? <Text style={{ ...typography.body, color: semantic.textSecondary }}>{n.body}</Text> : null}
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
      </View>
    </Screen>
  );
}
