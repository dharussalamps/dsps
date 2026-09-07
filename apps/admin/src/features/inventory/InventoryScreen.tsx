import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { createInventoryItem } from './api';
import { useInventoryItems } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function InventoryScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const items = useInventoryItems(query);
  const queryClient = useQueryClient();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [minQuantity, setMinQuantity] = useState('0');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim() || !category.trim()) return;
    setSaving(true);
    try {
      await createInventoryItem({ name: name.trim(), category: category.trim(), minQuantity: Number(minQuantity) || 0 });
      setAdding(false);
      setName('');
      setCategory('');
      setMinQuantity('0');
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="Inventory">
          <Button label={adding ? 'Cancel' : 'Add item'} size="sm" onPress={() => setAdding((v) => !v)} />
        </ScreenHeader>
        {adding ? (
          <Card>
            <TextField label="Name" value={name} onChangeText={setName} />
            <TextField label="Category" value={category} onChangeText={setCategory} />
            <TextField label="Minimum quantity" value={minQuantity} onChangeText={setMinQuantity} keyboardType="numeric" />
            <Button label="Save" onPress={() => void submit()} loading={saving} />
          </Card>
        ) : (
          <TextField placeholder="Search by name, category or code" value={query} onChangeText={setQuery} autoCapitalize="none" />
        )}
      </View>

      {items.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No items" />}
          renderItem={({ item }) => (
            <Card onPress={() => navigation.navigate('InventoryItem', { itemId: item.id })} flat>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ gap: 2 }}>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.name}</Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                    {item.category}
                    {item.location ? ` · ${item.location}` : ''}
                  </Text>
                </View>
                <StatusPill label={`${item.quantity} in stock`} tone={item.lowStock ? 'error' : 'success'} />
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
