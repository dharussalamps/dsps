import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { markAnnouncementRead } from './api';
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
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.title}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={2}>
                    {item.body}
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {item.authorName} · {new Date(item.publishAt).toLocaleDateString()}
                  </Text>
                </View>
                {!item.isRead ? <StatusPill label="New" tone="gold" /> : null}
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
