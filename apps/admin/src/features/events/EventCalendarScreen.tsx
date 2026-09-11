import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader, TextField } from '@/components';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { parseDMY } from '@/lib/date';
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
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [location, setLocation] = useState('');
  const [reminderDays, setReminderDays] = useState('7,1');
  const [responsible, setResponsible] = useState<StaffSummary | null>(null);
  const [responsibleQuery, setResponsibleQuery] = useState('');
  const [responsibleResults, setResponsibleResults] = useState<StaffSummary[]>([]);
  const [saving, setSaving] = useState(false);

  useConfirmDiscardOnLeave(
    adding &&
      (!!title.trim() ||
        !!description.trim() ||
        !!category.trim() ||
        !!startsOn.trim() ||
        !!endsOn.trim() ||
        !!location.trim() ||
        !!responsible ||
        !!responsibleQuery.trim()),
  );

  async function searchResponsible(q: string) {
    setResponsibleQuery(q);
    setResponsibleResults(q.trim() ? await listStaff(q) : []);
  }

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
    const isoStartsOn = parseDMY(startsOn);
    const isoEndsOn = endsOn.trim() ? parseDMY(endsOn) : undefined;
    if (!isoStartsOn || (endsOn.trim() && !isoEndsOn)) {
      Alert.alert('Invalid date', 'Enter dates as DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    try {
      const days = reminderDays
        .split(',')
        .map((d) => Number(d.trim()))
        .filter((d) => !Number.isNaN(d) && d >= 0);
      await createEvent({
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        startsOn: isoStartsOn,
        endsOn: isoEndsOn ?? undefined,
        location: location.trim() || undefined,
        responsibleId: responsible?.id,
        reminderDays: days.length > 0 ? days : undefined,
        createdBy: staff.id,
      });
      setAdding(false);
      setTitle('');
      setDescription('');
      setCategory('');
      setStartsOn('');
      setEndsOn('');
      setLocation('');
      setReminderDays('7,1');
      setResponsible(null);
      setResponsibleQuery('');
      await queryClient.invalidateQueries({ queryKey: ['events', 'month'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Events" tone="onPrimary" back={navigation.canGoBack()}>
          <Button label={adding ? 'Cancel' : 'Add event'} icon={adding ? 'close' : 'add'} size="sm" variant="secondary" onPress={() => setAdding((v) => !v)} />
        </ScreenHeader>
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {adding ? (
          <Card>
            <TextField label="Title" value={title} onChangeText={setTitle} />
            <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline />
            <TextField label="Category (optional)" value={category} onChangeText={setCategory} placeholder="e.g. sports, exam, holiday" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField label="Starts on" placeholder="DD/MM/YYYY" value={startsOn} onChangeText={setStartsOn} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Ends on (optional)" placeholder="DD/MM/YYYY" value={endsOn} onChangeText={setEndsOn} />
              </View>
            </View>
            <TextField label="Location (optional)" value={location} onChangeText={setLocation} />
            <TextField label="Reminder lead times (days, comma-separated)" value={reminderDays} onChangeText={setReminderDays} />
            <TextField label="Responsible staff (search, optional)" value={responsibleQuery} onChangeText={(v) => void searchResponsible(v)} />
            {responsibleQuery && !responsible ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {responsibleResults.map((s) => (
                  <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => { setResponsible(s); setResponsibleQuery(s.fullName); }} />
                ))}
              </View>
            ) : null}
            <Button label="Save" onPress={() => void submit()} loading={saving} />
          </Card>
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
    </Screen>
  );
}
