import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, HeaderIconButton, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, StatusPill, TextField } from '@/components';
import { todayIso } from '@/features/attendance/hooks';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, spacing, typography, semantic } from '@/theme/tokens';
import { addDiaryEntry, completeEvent, deleteEvent, updateEvent } from './api';
import { DateTile } from './DateTile';
import { categoryStyle } from './eventCategories';
import { EventForm, type EventFormInitial, type EventFormPayload } from './EventForm';
import { useCanCompleteEvent, useCanManageEvents, useEvent } from './hooks';

type Route = RouteProp<RootStackParamList, 'EventDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatEventDate(iso: string): string {
  return format(parseISO(iso), 'EEE, d MMM yyyy');
}

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
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
      // So hasDiaryEntry is correct if the user navigates back to this event later.
      await queryClient.invalidateQueries({ queryKey: ['events'] });
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
      // Broad prefix: refreshes this detail view and the month/year list's status pill.
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      // complete_event() auto-inserts a diary entry — refresh the diary list too.
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
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
    await queryClient.invalidateQueries({ queryKey: ['events'] });
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
      await queryClient.invalidateQueries({ queryKey: ['events'] });
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
  const canDelete = isPrincipal && !e.hasDiaryEntry;
  const dateRangeLabel =
    e.endsOn && e.endsOn !== e.startsOn ? `${formatEventDate(e.startsOn)} → ${formatEventDate(e.endsOn)}` : formatEventDate(e.startsOn);

  if (editing) {
    const initial: EventFormInitial = {
      title: e.title,
      description: e.description ?? undefined,
      category: e.category ?? undefined,
      startsOn: toDMY(e.startsOn),
      endsOn: e.endsOn ? toDMY(e.endsOn) : undefined,
      location: e.location ?? undefined,
      reminderDays: e.reminderDays.length > 0 ? e.reminderDays.join(',') : '',
      responsible: e.responsible,
    };
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Edit event" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        </Hero>
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <EventForm
            initial={initial}
            headerIcon="create-outline"
            headerLabel="EDIT EVENT"
            submitLabel="Save changes"
            confirmTitle="Save changes?"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />

          {isPrincipal ? (
            <Card style={{ gap: spacing.xs }}>
              <SectionHeader icon="warning-outline" label="DANGER ZONE" />
              <Button
                label="Delete event"
                icon="trash-outline"
                variant="danger"
                onPress={confirmDelete}
                loading={deleting}
                disabled={!canDelete}
              />
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                {canDelete
                  ? 'This cannot be undone. This only works if it has no diary entry yet.'
                  : 'Already saved to the diary — events with a diary entry cannot be deleted.'}
              </Text>
            </Card>
          ) : null}
        </View>
      </Screen>
    );
  }

  const cat = categoryStyle(e.category);
  const status = e.completedAt ? { label: 'Completed', tone: 'success' as const } : eventPassed ? { label: 'Not completed', tone: 'warning' as const } : null;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title={e.title} tone="onPrimary" back={navigation.canGoBack()} hideBell>
          {canManage ? <HeaderIconButton icon="create-outline" accessibilityLabel="Edit event" onPress={() => setEditing(true)} /> : null}
        </ScreenHeader>

        <View style={styles.heroInfoRow}>
          <DateTile iso={e.startsOn} size="lg" />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={styles.heroDateLabel}>{dateRangeLabel}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {e.category ? (
                <View style={styles.heroCategoryChip}>
                  <Icon name={cat.icon} size={12} color={colors.white} />
                  <Text style={styles.heroCategoryText}>{e.category}</Text>
                </View>
              ) : null}
              {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
            </View>
          </View>
        </View>
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card style={{ gap: spacing.md }}>
        <SectionHeader icon="information-circle-outline" label="DETAILS" />
        {e.description ? <Text style={{ ...typography.body, color: semantic.textPrimary }}>{e.description}</Text> : null}
        {e.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Icon name="location-outline" size={14} color={semantic.textSecondary} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{e.location}</Text>
          </View>
        ) : null}
        {!e.description && !e.location ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No description or location added.</Text>
        ) : null}
      </Card>

      {e.responsible.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          <SectionHeader icon="people-outline" label="RESPONSIBLE STAFF" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {e.responsible.map((r) => (
              <View key={r.id} style={styles.staffChip}>
                <Avatar name={r.fullName} size={22} />
                <Text style={styles.staffChipText}>{r.fullName}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: spacing.md }}>
        <SectionHeader icon="notifications-outline" label="REMINDERS" />
        {e.reminderDays.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {[...e.reminderDays]
              .sort((a, b) => b - a)
              .map((d) => (
                <StatusPill key={d} label={d === 0 ? 'Same day' : d === 1 ? '1 day before' : `${d} days before`} tone="info" />
              ))}
          </View>
        ) : (
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No reminders set for this event.</Text>
        )}
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

      {e.hasDiaryEntry && !e.completedAt ? (
        // The Completed card above already says this for a completed event —
        // this covers the other way a diary entry can exist: added manually
        // without ever marking the event completed.
        <StatusPill label="Added to diary" tone="info" />
      ) : isPrincipal ? (
        addingToDiary ? (
          <Card>
            <TextField label="Diary note" value={note} onChangeText={setNote} multiline />
            <Button label="Save to diary" onPress={() => void saveDiary()} loading={saving} />
          </Card>
        ) : (
          <Button label="Add to diary" variant="outline" icon="book-outline" onPress={() => setAddingToDiary(true)} />
        )
      ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroInfoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroDateLabel: { ...typography.bodyStrong, color: colors.white },
  heroCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heroCategoryText: { ...typography.caption, fontSize: 11, fontWeight: '600', color: colors.white },
  staffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  staffChipText: { ...typography.captionStrong, color: semantic.primary },
});
