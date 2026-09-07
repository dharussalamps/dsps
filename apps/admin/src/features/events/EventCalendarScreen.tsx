import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenHeader, TextField } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { createEvent } from './api';
import { useEventsInMonth } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function EventCalendarScreen() {
  const navigation = useNavigation<Nav>();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const events = useEventsInMonth(year, month);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [saving, setSaving] = useState(false);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m > 12) {
      m = 1;
      y += 1;
    } else if (m < 1) {
      m = 12;
      y -= 1;
    }
    setMonth(m);
    setYear(y);
  }

  async function submit() {
    if (!staff || !title.trim() || !startsOn.trim()) return;
    setSaving(true);
    try {
      await createEvent({ title: title.trim(), startsOn: startsOn.trim(), createdBy: staff.id });
      setAdding(false);
      setTitle('');
      setStartsOn('');
      await queryClient.invalidateQueries({ queryKey: ['events', 'month'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: semantic.background }} edges={['top', 'left', 'right']}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ScreenHeader title="Events">
          <Button label={adding ? 'Cancel' : 'Add event'} size="sm" onPress={() => setAdding((v) => !v)} />
        </ScreenHeader>

        {adding ? (
          <Card>
            <TextField label="Title" value={title} onChangeText={setTitle} />
            <TextField label="Date" placeholder="YYYY-MM-DD" value={startsOn} onChangeText={setStartsOn} />
            <Button label="Save" onPress={() => void submit()} loading={saving} />
          </Card>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button label="← Prev" size="sm" variant="ghost" onPress={() => shiftMonth(-1)} />
            <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>
              {new Date(year, month - 1).toLocaleString([], { month: 'long', year: 'numeric' })}
            </Text>
            <Button label="Next →" size="sm" variant="ghost" onPress={() => shiftMonth(1)} />
          </View>
        )}
      </View>

      {events.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={events.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={<EmptyState title="No events this month" />}
          renderItem={({ item }) => (
            <Card onPress={() => navigation.navigate('EventDetail', { eventId: item.id })} flat>
              <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{item.title}</Text>
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                {item.startsOn}
                {item.endsOn ? ` → ${item.endsOn}` : ''}
              </Text>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
