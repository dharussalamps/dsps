import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Card, EmptyState, Screen, ScreenHeader } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { usePendingLeaveRequests } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function LeaveRequestsScreen() {
  const navigation = useNavigation<Nav>();
  const pending = usePendingLeaveRequests();

  return (
    <Screen scroll={false}>
      <FlatList
        data={pending.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={<ScreenHeader title="Leave requests" subtitle={`${pending.data?.length ?? 0} pending`} />}
        ListEmptyComponent={
          pending.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No pending requests" />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('LeaveRequestDetail', { requestId: item.id })} flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.staffName}</Text>
              <Text style={{ ...typography.body, color: semantic.textSecondary }}>{item.dayCount}d</Text>
            </View>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {item.leaveTypeName} · {item.startsOn} → {item.endsOn}
            </Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
              {item.reason}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
