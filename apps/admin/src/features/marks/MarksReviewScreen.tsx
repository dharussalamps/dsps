import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill } from '@/components';
import { semantic, spacing, typography } from '@/theme/tokens';
import { reopenMarkSheet } from './api';
import { useVisibleMarkSheets } from './hooks';

export function MarksReviewScreen() {
  const navigation = useNavigation();
  const sheets = useVisibleMarkSheets();
  const queryClient = useQueryClient();
  const [reopening, setReopening] = useState<string | null>(null);

  async function reopen(id: string) {
    setReopening(id);
    try {
      await reopenMarkSheet(id);
      await queryClient.invalidateQueries({ queryKey: ['marks', 'visible-sheets'] });
    } finally {
      setReopening(null);
    }
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Marks review" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <FlatList
        data={sheets.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          sheets.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <EmptyState title="No mark sheets in scope" />
          )
        }
        renderItem={({ item }) => (
          <Card flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ gap: 2 }}>
                <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>
                  {item.className} · {item.subjectName}
                </Text>
                <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.termName}</Text>
              </View>
              <StatusPill label={item.status} tone={item.status === 'draft' ? 'gold' : 'success'} />
            </View>
            {item.status === 'submitted' ? (
              <Button label="Reopen" size="sm" variant="outline" loading={reopening === item.id} onPress={() => void reopen(item.id)} />
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}
