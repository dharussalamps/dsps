import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { createEvent } from './api';
import { EventForm, type EventFormPayload } from './EventForm';
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

  async function handleCreate(payload: EventFormPayload) {
    if (!staff) return;
    await createEvent({ ...payload, createdBy: staff.id });
    setAdding(false);
    await queryClient.invalidateQueries({ queryKey: ['events', 'month'] });
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Events" tone="onPrimary" back={navigation.canGoBack()} hideBell>
          <Button label={adding ? 'Cancel' : 'Add event'} icon={adding ? 'close' : 'add'} size="sm" variant="secondary" onPress={() => setAdding((v) => !v)} />
        </ScreenHeader>
      </Hero>

      {events.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={events.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
              {adding ? (
                <EventForm
                  headerLabel="NEW EVENT"
                  submitLabel="Save event"
                  confirmTitle="Save this event?"
                  onSubmit={handleCreate}
                  onCancel={() => setAdding(false)}
                />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Button label="Prev" icon="chevron-back" size="sm" variant="ghost" onPress={() => shiftMonth(-1)} />
                  <Text style={{ ...typography.subtitle, color: semantic.textPrimary }}>
                    {new Date(year, month - 1).toLocaleString([], { month: 'long', year: 'numeric' })}
                  </Text>
                  <Button label="Next" icon="chevron-forward" iconPosition="right" size="sm" variant="ghost" onPress={() => shiftMonth(1)} />
                </View>
              )}
            </View>
          }
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
    </Screen>
  );
}
