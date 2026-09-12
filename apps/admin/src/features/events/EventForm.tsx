import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, DateField, Icon, type IconName, SectionHeader, TextField } from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { radius, semantic, spacing, typography } from '@/theme/tokens';
import type { EventInput } from './api';

export type EventFormPayload = EventInput;

/** Only what the form displays/submits for the responsible staff member — a search result
 * (a full StaffSummary) satisfies this structurally, and so does the {id, fullName} an edit
 * screen already has on hand from EventDetail without a separate staff-profile fetch. */
type ResponsibleRef = Pick<StaffSummary, 'id' | 'fullName'>;

export type EventFormInitial = {
  title?: string;
  description?: string;
  category?: string;
  startsOn?: string; // DD/MM/YYYY
  endsOn?: string; // DD/MM/YYYY
  location?: string;
  reminderDays?: string; // comma-separated
  responsible?: ResponsibleRef | null;
};

type Props = {
  initial?: EventFormInitial;
  headerIcon?: IconName;
  headerLabel: string;
  submitLabel: string;
  confirmTitle: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
  onCancel?: () => void;
};

/** Shared field set + validation for both "add event" (EventCalendarScreen) and "edit event"
 * (EventDetailScreen) — same fields, same rules, only the submit action differs, so that lives
 * with the caller (create vs. update) rather than here. */
export function EventForm({ initial, headerIcon = 'add-circle-outline', headerLabel, submitLabel, confirmTitle, onSubmit, onCancel }: Props) {
  const initialTitle = initial?.title ?? '';
  const initialDescription = initial?.description ?? '';
  const initialCategory = initial?.category ?? '';
  const initialStartsOn = initial?.startsOn ?? '';
  const initialEndsOn = initial?.endsOn ?? '';
  const initialLocation = initial?.location ?? '';
  const initialReminderDays = initial?.reminderDays ?? '7,1';
  const initialResponsibleQuery = initial?.responsible?.fullName ?? '';

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const [startsOn, setStartsOn] = useState(initialStartsOn);
  const [endsOn, setEndsOn] = useState(initialEndsOn);
  const [location, setLocation] = useState(initialLocation);
  const [reminderDays, setReminderDays] = useState(initialReminderDays);
  const [responsible, setResponsible] = useState<ResponsibleRef | null>(initial?.responsible ?? null);
  const [responsibleQuery, setResponsibleQuery] = useState(initialResponsibleQuery);
  const [responsibleResults, setResponsibleResults] = useState<StaffSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; startsOn?: string; endsOn?: string; reminderDays?: string }>({});

  useConfirmDiscardOnLeave(
    title !== initialTitle ||
      description !== initialDescription ||
      category !== initialCategory ||
      startsOn !== initialStartsOn ||
      endsOn !== initialEndsOn ||
      location !== initialLocation ||
      reminderDays !== initialReminderDays ||
      responsibleQuery !== initialResponsibleQuery ||
      (responsible?.id ?? null) !== (initial?.responsible?.id ?? null),
  );

  async function searchResponsible(q: string) {
    setResponsibleQuery(q);
    if (responsible && q !== responsible.fullName) setResponsible(null);
    setResponsibleResults(q.trim() ? await listStaff(q) : []);
  }

  function validate(): EventFormPayload | null {
    const nextErrors: typeof errors = {};
    const isoStartsOn = parseDMY(startsOn);

    if (!title.trim()) nextErrors.title = 'Title is required.';

    if (!startsOn.trim()) nextErrors.startsOn = 'Start date is required.';
    else if (!isoStartsOn) nextErrors.startsOn = 'Enter a valid date as DD/MM/YYYY.';

    let isoEndsOn: string | undefined;
    if (endsOn.trim()) {
      const parsed = parseDMY(endsOn);
      if (!parsed) nextErrors.endsOn = 'Enter a valid date as DD/MM/YYYY.';
      else if (isoStartsOn && parsed <= isoStartsOn) nextErrors.endsOn = 'End date must be after the start date.';
      else isoEndsOn = parsed;
    }

    let days: number[] | undefined;
    if (reminderDays.trim()) {
      const validReminderDays = reminderDays.split(',').every((d) => /^\s*\d+\s*$/.test(d));
      if (!validReminderDays) nextErrors.reminderDays = 'Use whole numbers separated by commas, e.g. 7,1.';
      else days = reminderDays.split(',').map((d) => Number(d.trim())).filter((d) => !Number.isNaN(d) && d >= 0);
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !isoStartsOn) return null;

    return {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      startsOn: isoStartsOn,
      endsOn: isoEndsOn,
      location: location.trim() || undefined,
      responsibleId: responsible?.id,
      reminderDays: days && days.length > 0 ? days : undefined,
    };
  }

  function confirmSubmit() {
    const payload = validate();
    if (!payload) return;
    Alert.alert(confirmTitle, `${payload.title}\n${startsOn}${endsOn.trim() ? ` → ${endsOn}` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: () => void doSubmit(payload) },
    ]);
  }

  async function doSubmit(payload: EventFormPayload) {
    setSaving(true);
    try {
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionHeader icon={headerIcon} label={headerLabel} />
      <TextField
        label="Title"
        value={title}
        onChangeText={(t) => { setTitle(t); setErrors((e) => ({ ...e, title: undefined })); }}
        error={errors.title}
      />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      <TextField label="Category (optional)" value={category} onChangeText={setCategory} placeholder="e.g. sports, exam, holiday" />

      <View style={{ gap: spacing.sm }}>
        <DateField
          label="Starts on"
          value={startsOn}
          onChangeText={(t) => { setStartsOn(formatDMYInput(t)); setErrors((e) => ({ ...e, startsOn: undefined })); }}
          onPickIso={(iso) => { setStartsOn(toDMY(iso)); setErrors((e) => ({ ...e, startsOn: undefined })); }}
          error={errors.startsOn}
        />
        <DateField
          label="Ends on (optional)"
          value={endsOn}
          onChangeText={(t) => { setEndsOn(formatDMYInput(t)); setErrors((e) => ({ ...e, endsOn: undefined })); }}
          onPickIso={(iso) => { setEndsOn(toDMY(iso)); setErrors((e) => ({ ...e, endsOn: undefined })); }}
          minDate={parseDMY(startsOn) ?? undefined}
          error={errors.endsOn}
        />
      </View>

      <TextField label="Location (optional)" value={location} onChangeText={setLocation} />

      <TextField
        label="Reminder lead times (days, comma-separated)"
        value={reminderDays}
        onChangeText={(t) => { setReminderDays(t); setErrors((e) => ({ ...e, reminderDays: undefined })); }}
        error={errors.reminderDays}
        hint="The responsible staff member is reminded this many days before the event."
      />

      {responsible ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.responsibleChip}>
            <Icon name="person-outline" size={13} color={semantic.primary} />
            <Text style={styles.responsibleChipText}>{responsible.fullName}</Text>
          </View>
          <Button label="Change" size="sm" variant="ghost" onPress={() => { setResponsible(null); setResponsibleQuery(''); setResponsibleResults([]); }} />
        </View>
      ) : (
        <>
          <TextField label="Responsible staff (search, optional)" value={responsibleQuery} onChangeText={(v) => void searchResponsible(v)} />
          {responsibleQuery ? (
            responsibleResults.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                {responsibleResults.map((s) => (
                  <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => { setResponsible(s); setResponsibleQuery(s.fullName); setResponsibleResults([]); }} />
                ))}
              </View>
            ) : (
              <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No staff match &ldquo;{responsibleQuery}&rdquo;.</Text>
            )
          ) : null}
        </>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {onCancel ? <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} /> : null}
        <Button label={submitLabel} onPress={confirmSubmit} loading={saving} disabled={!title.trim() || !startsOn.trim()} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  responsibleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  responsibleChipText: { ...typography.captionStrong, color: semantic.primary },
});
