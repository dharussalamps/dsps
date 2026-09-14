import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, EmptyState, FloatingActionButton, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SegmentedControl, StatusPill } from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { useOpenDrawer } from '@/navigation/DrawerContext';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import {
  deleteAnnouncement,
  fetchAnnouncementReadStats,
  isAnnouncementDeletable,
  isAnnouncementEditable,
  markAnnouncementRead,
  type Announcement,
} from './api';
import { useAnnouncements } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AnnouncementsScreen() {
  const navigation = useNavigation<Nav>();
  const openDrawer = useOpenDrawer();
  const staff = useAuthStore((s) => s.staff);
  const isPrincipal = useIsPrincipal();
  const announcements = useAnnouncements(staff?.id);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  async function open(id: string) {
    if (!staff) return;
    await markAnnouncementRead(id, staff.id);
    await queryClient.invalidateQueries({ queryKey: ['announcements', staff.id] });
    await queryClient.invalidateQueries({ queryKey: ['announcements', 'unread-count', staff.id] });
  }

  const all = announcements.data ?? [];
  const unreadCount = all.filter((a) => !a.isRead).length;
  const visible = filter === 'unread' ? all.filter((a) => !a.isRead) : all;

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="megaphone-outline" bottomIcon="chatbubble-ellipses-outline" />
        <ScreenHeader
          title="Announcements"
          subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          tone="onPrimary"
          onMenuPress={openDrawer}
          back={!openDrawer && navigation.canGoBack()}
          hideBell
        />
        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { key: 'all', label: 'All', icon: 'list-outline' },
              { key: 'unread', label: 'Unread', icon: 'mail-unread-outline' },
            ]}
          />
        </View>
      </Hero>

      {announcements.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl + spacing.xxxl, paddingTop: spacing.sm }}
          ListEmptyComponent={
            <EmptyState
              icon={filter === 'unread' ? 'checkmark-done-outline' : 'megaphone-outline'}
              title={filter === 'unread' ? "You're all caught up" : 'No announcements yet'}
              message={filter === 'unread' ? 'No unread announcements right now.' : undefined}
            />
          }
          renderItem={({ item }) => (
            <AnnouncementRow
              item={item}
              isOwn={!!staff && item.authorId === staff.id}
              canDeleteAny={isPrincipal}
              onOpen={() => void open(item.id)}
              onEdit={() =>
                navigation.navigate('ComposeAnnouncement', {
                  editing: { id: item.id, title: item.title, body: item.body, priority: item.priority },
                })
              }
            />
          )}
        />
      )}

      <FloatingActionButton
        icon="add"
        accessibilityLabel="New announcement"
        onPress={() => navigation.navigate('ComposeAnnouncement')}
        bottom={spacing.xxxl + spacing.xxxl}
      />
    </Screen>
  );
}

/** Collapsed to just the title/badges/byline so the list stays scannable — tapping expands it
 * in place to read the message, which is also when it gets marked read (same markAsRead call
 * as before; it's just now visibly tied to actually opening the announcement). */
function AnnouncementRow({
  item,
  isOwn,
  canDeleteAny,
  onOpen,
  onEdit,
}: {
  item: Announcement;
  isOwn: boolean;
  /** Principal/vice-principal/administrator — holds 'announcement.publish_all', so may delete anyone's announcement, any time. */
  canDeleteAny: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  function toggle() {
    setExpanded((v) => !v);
    if (!item.isRead) onOpen();
  }

  function confirmDelete() {
    Alert.alert('Delete this announcement?', 'This cannot be undone — recipients will no longer see it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteAnnouncement(item.id);
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      Alert.alert(
        'Could not delete this announcement',
        message.includes('delete_window_expired')
          ? "You can only delete your own announcement on the day it was posted."
          : message.includes('forbidden')
            ? 'You can only delete your own announcements.'
            : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  const canDelete = canDeleteAny || (isOwn && isAnnouncementDeletable(item));

  return (
    <Card onPress={toggle} flat style={item.priority > 0 ? styles.priorityCard : undefined}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Avatar name={item.authorName} size={36} />
        <View style={{ flex: 1, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }}>
            <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }} numberOfLines={expanded ? undefined : 2}>
              {item.title}
            </Text>
            {isOwn && isAnnouncementEditable(item) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit announcement"
                hitSlop={8}
                onPress={onEdit}
                style={({ pressed }) => [styles.iconBtn, styles.editBtn, pressed && styles.editBtnPressed]}
              >
                <Icon name="create-outline" size={15} color={colors.info} />
              </Pressable>
            ) : null}
            {expanded && canDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete announcement"
                accessibilityState={{ disabled: deleting }}
                hitSlop={8}
                disabled={deleting}
                onPress={confirmDelete}
                style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && !deleting && styles.deleteBtnPressed]}
              >
                {deleting ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={15} color={colors.error} />}
              </Pressable>
            ) : null}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink300} />
          </View>

          {item.priority > 0 || !item.isRead ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {item.priority > 0 ? <StatusPill label="Priority" tone="error" /> : null}
              {!item.isRead ? <StatusPill label="Unread" tone="gold" /> : null}
            </View>
          ) : null}

          {expanded ? (
            <Text style={{ ...typography.body, color: semantic.textSecondary }}>{item.body}</Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text style={{ ...typography.caption, color: semantic.textSecondary, flex: 1 }} numberOfLines={1}>
              {item.authorName} · {new Date(item.publishAt).toLocaleDateString()}{' '}
              {new Date(item.publishAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isOwn ? <ReadReceipt announcement={item} /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

/** FR-ANN-05: shown only to the announcement's own author (RLS also only returns full stats to them — see 20260908000010_announcement_read_receipts.sql). */
function ReadReceipt({ announcement }: { announcement: Announcement }) {
  const stats = useQuery({
    queryKey: ['announcements', 'read-stats', announcement.id],
    queryFn: () => fetchAnnouncementReadStats(announcement.id),
  });
  if (!stats.data) return null;
  const { readCount, totalCount, readerNames, unreadNames } = stats.data;
  return (
    <Text
      style={{ ...typography.caption, color: semantic.link }}
      onPress={() =>
        Alert.alert(
          `Read by ${readCount} of ${totalCount}`,
          [
            `READ (${readerNames.length})`,
            readerNames.length > 0 ? readerNames.join('\n') : 'No one has read it yet.',
            '',
            `HAVEN'T READ YET (${unreadNames.length})`,
            unreadNames.length > 0 ? unreadNames.join('\n') : 'Everyone has read it.',
          ].join('\n'),
        )
      }
    >
      {readCount}/{totalCount} read
    </Text>
  );
}

const styles = StyleSheet.create({
  priorityCard: { borderLeftWidth: 3, borderLeftColor: colors.error },
  iconBtn: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  editBtn: { backgroundColor: colors.infoBg },
  editBtnPressed: { backgroundColor: colors.info + '33' },
  deleteBtn: { backgroundColor: colors.errorBg },
  deleteBtnPressed: { backgroundColor: colors.error + '33' },
});
