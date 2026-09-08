import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { fetchAnnouncementReadStats, markAnnouncementRead, type Announcement } from './api';
import { useAnnouncements } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AnnouncementsScreen() {
  const navigation = useNavigation<Nav>();
  const staff = useAuthStore((s) => s.staff);
  const announcements = useAnnouncements(staff?.id);
  const queryClient = useQueryClient();

  async function open(id: string) {
    if (!staff) return;
    await markAnnouncementRead(id, staff.id);
    await queryClient.invalidateQueries({ queryKey: ['announcements', staff.id] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="Announcements">
          <Button label="New" size="sm" onPress={() => navigation.navigate('ComposeAnnouncement')} />
        </ScreenHeader>
      </View>

      {announcements.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={announcements.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No announcements yet" />}
          renderItem={({ item }) => (
            <Card onPress={() => void open(item.id)} flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.title}</Text>
                    {item.priority > 0 ? <StatusPill label="Priority" tone="error" /> : null}
                  </View>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {item.authorName} · {new Date(item.publishAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                  {!item.isRead ? <StatusPill label="New" tone="gold" /> : null}
                  {staff && item.authorId === staff.id ? <ReadReceipt announcement={item} /> : null}
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}

/** FR-ANN-05: shown only to the announcement's own author (RLS also only returns full stats to them — see 20260908000010_announcement_read_receipts.sql). */
function ReadReceipt({ announcement }: { announcement: Announcement }) {
  const stats = useQuery({
    queryKey: ['announcements', 'read-stats', announcement.id],
    queryFn: () => fetchAnnouncementReadStats(announcement.id),
  });
  if (!stats.data) return null;
  return (
    <Text
      style={{ ...typography.caption, color: semantic.link }}
      onPress={() =>
        Alert.alert(
          'Read by',
          stats.data.readerNames.length > 0 ? stats.data.readerNames.join('\n') : 'No one has read this yet.',
        )
      }
    >
      {stats.data.readCount}/{stats.data.totalCount} read
    </Text>
  );
}
