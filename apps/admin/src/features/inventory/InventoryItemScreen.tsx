import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { recordInventoryTransaction, type InventoryTransaction } from './api';
import { useInventoryItem, useInventoryTransactions } from './hooks';

type Route = RouteProp<RootStackParamList, 'InventoryItem'>;

const txnTypes: InventoryTransaction['txnType'][] = ['receipt', 'issue', 'return', 'write_off', 'adjustment'];
const signedDefault: Record<string, 1 | -1> = { receipt: 1, issue: -1, return: 1, write_off: -1, adjustment: 1 };

export function InventoryItemScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<Route>();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const item = useInventoryItem(params.itemId);
  const transactions = useInventoryTransactions(params.itemId);

  const [txnType, setTxnType] = useState<InventoryTransaction['txnType']>('receipt');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!staff || !amount.trim()) return;
    const magnitude = Math.abs(Number(amount));
    if (Number.isNaN(magnitude) || magnitude === 0) return;
    setSaving(true);
    try {
      await recordInventoryTransaction({
        itemId: params.itemId,
        txnType,
        quantity: magnitude * signedDefault[txnType],
        note: note.trim(),
        actorId: staff.id,
      });
      setAmount('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'item', params.itemId] });
      await queryClient.invalidateQueries({ queryKey: ['inventory', 'transactions', params.itemId] });
    } finally {
      setSaving(false);
    }
  }

  if (item.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Item" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!item.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero>
          <ScreenHeader title="Item" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Item not found" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title={item.data.name} subtitle={item.data.category} tone="onPrimary" back={navigation.canGoBack()}>
          <StatusPill label={`${item.data.quantity} in stock`} tone={item.data.lowStock ? 'error' : 'success'} />
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <Row label="Location" value={item.data.location ?? '—'} />
        <Row label="Condition" value={item.data.condition ?? '—'} />
        <Row label="Code" value={item.data.code ?? '—'} />
        <Row label="Minimum quantity" value={String(item.data.minQuantity)} />
      </Card>

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>RECORD MOVEMENT</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {txnTypes.map((t) => (
            <Button key={t} label={t.replace('_', ' ')} size="sm" variant={txnType === t ? 'primary' : 'outline'} onPress={() => setTxnType(t)} />
          ))}
        </View>
        <TextField label="Quantity" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} />
        <Button label="Save" onPress={() => void submit()} loading={saving} />
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>HISTORY</Text>
        {(transactions.data ?? []).map((t) => (
          <Card key={t.id} flat>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ ...typography.body, color: semantic.textPrimary }}>{t.txnType.replace('_', ' ')}</Text>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</Text>
            </View>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{new Date(t.createdAt).toLocaleString()}</Text>
            {t.note ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{t.note}</Text> : null}
          </Card>
        ))}
      </View>
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}
