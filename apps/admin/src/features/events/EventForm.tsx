import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, DateField, Icon, type IconName, SectionHeader, TextField } from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { radius, semantic, spacing, typography } from '@/theme/tokens';
import type { EventInput } from './api';
import { EVENT_CATEGORY_PRESETS } from './eventCategories';

export type EventFormPayload = EventInput;

/** Only what the form displays/submits for the responsible staff member — a search result
 * (a full StaffSummary) satisfies this structurally, and so does the {id, fullName} an edit
 * screen already has on hand from EventDetail without a separate staff-profile fetch. */
type ResponsibleRef = Pick<StaffSummary, 'id' | 'fullName'>;

/** Common lead times shown as toggle chips instead of a raw comma-separated number field —
 * "7,1" meant nothing to users. Kept as plain days-before values so an existing event's
 * saved days (e.g. from data entered before this UI existed) still round-trip: any value
 * not in this list is appended as its own chip in reminderDayOptions() below. */
const REMINDER_PRESETS: { days: number; label: string }[] = [
  { days: 0, label: 'Same day' },
  { days: 1, label: '1 day before' },
  { days: 3, label: '3 days before' },
  { days: 7, label: '1 week before' },
  { days: 14, label: '2 weeks before' },
  { days: 30, label: '1 month before' },
];

function parseReminderDays(csv: string): number[] {
  return csv
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0);
}

function reminderDayOptions(selected: Set<number>): { days: number; label: string }[] {
  const extra = [...selected]
    .filter((d) => !REMINDER_PRESETS.some((p) => p.days === d))
    .sort((a, b) => b - a)
    .map((days) => ({ days, label: days === 0 ? 'Same day' : `${days} days before` }));
  return [...REMINDER_PRESETS, ...extra];
}

export type EventFormInitial = {
  title?: string;
  description?: string;
  category?: string;
  startsOn?: string; // DD/MM/YYYY
  endsOn?: string; // DD/MM/YYYY
  location?: string;
  reminderDays?: string; // comma-separated
  responsible?: ResponsibleRef[];
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
  const initialReminderDays = new Set(parseReminderDays(initial?.reminderDays ?? '7,1'));
  const initialResponsible = initial?.responsible ?? [];

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const [startsOn, setStartsOn] = useState(initialStartsOn);
  const [endsOn, setEndsOn] = useState(initialEndsOn);
  const [location, setLocation] = useState(initialLocation);
  const [reminderDays, setReminderDays] = useState(initialReminderDays);
  const [responsibleList, setResponsibleList] = useState<ResponsibleRef[]>(initialResponsible);
  const [responsibleQuery, setResponsibleQuery] = useState('');
  const [responsibleResults, setResponsibleResults] = useState<StaffSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; startsOn?: string; endsOn?: string }>({});

  function addResponsible(s: ResponsibleRef) {
    setResponsibleList((prev) => (prev.some((r) => r.id === s.id) ? prev : [...prev, s]));
    setResponsibleQuery('');
    setResponsibleResults([]);
  }

  function removeResponsible(id: string) {
    setResponsibleList((prev) => prev.filter((r) => r.id !== id));
  }

  function toggleReminderDay(days: number) {
    setReminderDays((prev) => {
      const next = new Set(prev);
      if (next.has(days)) next.delete(days);
      else next.add(days);
      return next;
    });
  }

  const reminderDaysChanged = reminderDays.size !== initialReminderDays.size || [...reminderDays].some((d) => !initialReminderDays.has(d));
  const responsibleChanged =
    responsibleList.length !== initialResponsible.length || responsibleList.some((r) => !initialResponsible.some((ir) => ir.id === r.id));

  useConfirmDiscardOnLeave(
    title !== initialTitle ||
      description !== initialDescription ||
      category !== initialCategory ||
      startsOn !== initialStartsOn ||
      endsOn !== initialEndsOn ||
      location !== initialLocation ||
      reminderDaysChanged ||
      responsibleChanged,
  );

  async function searchResponsible(q: string) {
    setResponsibleQuery(q);
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
      else if (isoStartsOn && parsed < isoStartsOn) nextErrors.endsOn = 'End date cannot be before the start date.';
      else isoEndsOn = parsed;
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
      responsibleIds: responsibleList.length > 0 ? responsibleList.map((r) => r.id) : undefined,
      reminderDays: reminderDays.size > 0 ? [...reminderDays].sort((a, b) => b - a) : undefined,
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

  const reminderOptions = reminderDayOptions(reminderDays);

  const selectedCategoryKey = category.trim().toLowerCase();

  return (
    <Card style={{ gap: spacing.lg }}>
      <SectionHeader icon={headerIcon} label={headerLabel} />

      <View style={{ gap: spacing.md }}>
        <TextField
          label="Title"
          value={title}
          onChangeText={(t) => { setTitle(t); setErrors((e) => ({ ...e, title: undefined })); }}
          error={errors.title}
        />
        <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.groupLabel}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {EVENT_CATEGORY_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              label={preset.label}
              icon={preset.icon}
              size="sm"
              variant={selectedCategoryKey === preset.key ? 'primary' : 'outline'}
              onPress={() => setCategory((c) => (c.trim().toLowerCase() === preset.key ? '' : preset.label))}
            />
          ))}
        </View>
        <TextField label="Custom category (optional)" value={category} onChangeText={setCategory} placeholder="e.g. exam prep, field trip" />
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader icon="calendar-outline" label="SCHEDULE" />
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
        <TextField label="Location (optional)" value={location} onChangeText={setLocation} />
      </View>

      <View style={{ gap: spacing.xs }}>
        <SectionHeader icon="notifications-outline" label="REMINDERS" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {reminderOptions.map((opt) => (
            <Button
              key={opt.days}
              label={opt.label}
              size="sm"
              variant={reminderDays.has(opt.days) ? 'primary' : 'outline'}
              onPress={() => toggleReminderDay(opt.days)}
            />
          ))}
        </View>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
          Responsible staff (if any) and school leadership are reminded on each selected day before the event. Select none to turn off reminders.
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader icon="people-outline" label="RESPONSIBLE STAFF" />
        {responsibleList.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {responsibleList.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                <View style={styles.responsibleChip}>
                  <Icon name="person-outline" size={13} color={semantic.primary} />
                  <Text style={styles.responsibleChipText}>{r.fullName}</Text>
                </View>
                <Button
                  label=""
                  accessibilityLabel={`Remove ${r.fullName}`}
                  icon="close"
                  size="sm"
                  variant="ghost"
                  onPress={() => removeResponsible(r.id)}
                />
              </View>
            ))}
          </View>
        ) : null}
        <TextField label="Add responsible staff (search, optional)" value={responsibleQuery} onChangeText={(v) => void searchResponsible(v)} />
        {responsibleQuery ? (
          responsibleResults.filter((s) => !responsibleList.some((r) => r.id === s.id)).length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {responsibleResults
                .filter((s) => !responsibleList.some((r) => r.id === s.id))
                .map((s) => (
                  <Button key={s.id} label={s.fullName} size="sm" variant="outline" onPress={() => addResponsible(s)} />
                ))}
            </View>
          ) : (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>No staff match &ldquo;{responsibleQuery}&rdquo;.</Text>
          )
        ) : null}
      </View>

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
  groupLabel: { ...typography.captionStrong, color: semantic.textPrimary },
});
