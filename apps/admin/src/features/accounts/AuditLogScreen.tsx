import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Card, EmptyState, ScreenHeader } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { semantic, spacing, typography } from '@/theme/tokens';
import { useAuditLog } from './hooks';

export function AuditLogScreen() {
  const audit = useAuditLog();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg }}>
        <ScreenHeader title="Audit log" subtitle="Most recent 100 entries" />
      </View>

      {audit.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={audit.data ?? []}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No audit entries" />}
          renderItem={({ item }) => (
            <Card flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {item.action} · {item.entity}
                </Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.actorName ?? 'System'}</Text>
              {item.reason ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.reason}</Text> : null}
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
