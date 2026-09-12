import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, StatusPill, TextField } from '@/components';
import { todayIso } from '@/features/attendance/hooks';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addDiaryEntry, completeEvent, deleteEvent, updateEvent } from './api';
import { EventForm, type EventFormInitial, type EventFormPayload } from './EventForm';
import { useCanCompleteEvent, useCanManageEvents, useEvent } from './hooks';

type Route = RouteProp<RootStackParamList, 'EventDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function EventDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const event = useEvent(params.eventId);
  const canComplete = useCanCompleteEvent(event.data);
  const canManage = useCanManageEvents();
  const isPrincipal = useIsPrincipal();

  const [editing, setEditing] = useState(false);
  const [addingToDiary, setAddingToDiary] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useConfirmDiscardOnLeave(addingToDiary && !!note.trim());

  async function saveDiary() {
    if (!staff || !event.data) return;
    setSaving(true);
    try {
      await addDiaryEntry({ onDate: event.data.startsOn, title: event.data.title, body: note.trim(), eventId: event.data.id, authorId: staff.id });
      setAddingToDiary(false);
      setNote('');
      navigation.navigate('Diary');
    } finally {
      setSaving(false);
    }
  }

  function confirmComplete() {
    if (!event.data) return;
    const effectiveDate = event.data.endsOn ?? event.data.startsOn;
    if (todayIso() < effectiveDate) {
      Alert.alert('Too early', `This event can only be marked completed on or after ${format(parseISO(effectiveDate), 'd MMM yyyy')}.`);
      return;
    }
    Alert.alert(
      'Mark this event completed?',
      'This adds an entry to the school diary automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark completed', onPress: () => void doComplete() },
      ],
    );
  }

  async function doComplete() {
    setCompleting(true);
    try {
      await completeEvent(params.eventId);
      await queryClient.invalidateQueries({ queryKey: ['events', 'detail', params.eventId] });
      navigation.navigate('Diary');
    } catch (err) {
      Alert.alert('Could not mark this event completed', err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setCompleting(false);
    }
  }

  async function handleUpdate(payload: EventFormPayload) {
    await updateEvent(params.eventId, payload);
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: ['events', 'detail', params.eventId] });
    await queryClient.invalidateQueries({ queryKey: ['events', 'month'] });
  }

  function confirmDelete() {
    Alert.alert(
      'Delete this event?',
      'This cannot be undone. This only works if it has no diary entry yet.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
      ],
    );
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteEvent(params.eventId);
      await queryClient.invalidateQueries({ queryKey: ['events', 'month'] });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not delete this event', err instanceof Error ? err.message : 'Something went wrong — try again.');
    } finally {
      setDeleting(false);
    }
  }

  if (event.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Event" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }
  if (!event.data) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Event" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Event not found" />
        </View>
      </Screen>
    );
  }

  const e = event.data;
  const eventPassed = todayIso() >= (e.endsOn ?? e.startsOn);
  const canDelete = isPrincipal && !e.completedAt;

  if (editing) {
    const initial: EventFormInitial = {
      title: e.title,
      description: e.description ?? undefined,
      category: e.category ?? undefined,
      startsOn: toDMY(e.startsOn),
      endsOn: e.endsOn ? toDMY(e.endsOn) : undefined,
      location: e.location ?? undefined,
      reminderDays: e.reminderDays.length > 0 ? e.reminderDays.join(',') : '',
      responsible: e.responsibleId ? { id: e.responsibleId, fullName: e.responsibleName ?? '' } : null,
    };
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Edit event" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EventForm
            initial={initial}
            headerIcon="create-outline"
            headerLabel="EDIT EVENT"
            submitLabel="Save changes"
            confirmTitle="Save changes?"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title={e.title} subtitle={e.startsOn} tone="onPrimary" back={navigation.canGoBack()} hideBell>
          {canManage ? <Button label="Edit" icon="create-outline" size="sm" variant="secondary" onPress={() => setEditing(true)} /> : null}
        </ScreenHeader>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        {e.description ? <Text style={{ ...typography.body, color: semantic.textPrimary }}>{e.description}</Text> : null}
        {e.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="location-outline" size={14} color={semantic.textSecondary} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{e.location}</Text>
          </View>
        ) : null}
        {e.responsibleName ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Responsible: {e.responsibleName}</Text> : null}
      </Card>

      {e.completedAt ? (
        <Card style={{ gap: spacing.xs }}>
          <StatusPill label="Completed" tone="success" />
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {e.completedByName ? `Marked completed by ${e.completedByName} · ` : 'Marked completed · '}
            {format(parseISO(e.completedAt), 'd MMM yyyy')}
          </Text>
        </Card>
      ) : canComplete ? (
        <View style={{ gap: spacing.xs }}>
          <Button label="Mark as completed" icon="checkmark-done-outline" onPress={confirmComplete} loading={completing} disabled={!eventPassed} />
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {eventPassed
              ? 'Automatically adds a diary entry.'
              : `Available from ${format(parseISO(e.endsOn ?? e.startsOn), 'd MMM yyyy')}.`}
          </Text>
        </View>
      ) : null}

      {isPrincipal ? (
        addingToDiary ? (
          <Card>
            <TextField label="Diary note" value={note} onChangeText={setNote} multiline />
            <Button label="Save to diary" onPress={() => void saveDiary()} loading={saving} />
          </Card>
        ) : (
          <Button label="Add to diary" variant="outline" onPress={() => setAddingToDiary(true)} />
        )
      ) : null}

      {isPrincipal ? (
        <View style={{ gap: spacing.xs }}>
          <Button label="Delete event" icon="trash-outline" variant="danger" onPress={confirmDelete} loading={deleting} disabled={!canDelete} />
          {!canDelete ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              Already saved to the diary — completed events cannot be deleted.
            </Text>
          ) : null}
        </View>
      ) : null}
      </View>
    </Screen>
  );
}
