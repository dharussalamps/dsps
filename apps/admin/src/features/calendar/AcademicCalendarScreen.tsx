import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  DateField,
  EmptyState,
  Hero,
  HeroDoodle,
  Icon,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusPill,
  TextField,
  pillToneColors,
  type IconName,
} from '@/components';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { formatDMYInput, isCurrentPeriod, parseDMY, toDMY } from '@/lib/date';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, spacing, typography, semantic } from '@/theme/tokens';
import {
  addAcademicYear,
  addTerm,
  canDeleteAcademicYear,
  canDeleteTerm,
  deleteAcademicYear,
  deleteCalendarDay,
  deleteTerm,
  updateAcademicYear,
  updateSchoolSettings,
  updateTerm,
  updateWorkingWeekdays,
  type AcademicYear,
  type Term,
} from './api';
import { DAY_TYPE_META } from './dayTypeMeta';
import { useAcademicYears, useAllCalendarDays, useSchoolSettings, useTermsForYear, useWorkingWeekdays } from './hooks';
import { YearChip } from './YearChip';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEKDAY_LABELS: { iso: number; label: string; letter: string }[] = [
  { iso: 1, label: 'Mon', letter: 'M' },
  { iso: 2, label: 'Tue', letter: 'T' },
  { iso: 3, label: 'Wed', letter: 'W' },
  { iso: 4, label: 'Thu', letter: 'T' },
  { iso: 5, label: 'Fri', letter: 'F' },
  { iso: 6, label: 'Sat', letter: 'S' },
  { iso: 7, label: 'Sun', letter: 'S' },
];

/** A foreign key violation (Postgres 23503) means the row is still referenced elsewhere in the schema — the DB itself enforces "only deletable when unlinked". */
function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23503';
}

export function AcademicCalendarScreen() {
  const navigation = useNavigation<Nav>();
  const years = useAcademicYears();
  const settings = useSchoolSettings();
  const weekdays = useWorkingWeekdays();
  const allDays = useAllCalendarDays();
  const queryClient = useQueryClient();

  const [editingSettings, setEditingSettings] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [riskConsecutiveDays, setRiskConsecutiveDays] = useState('');
  const [riskAttendancePct, setRiskAttendancePct] = useState('');
  const [saving, setSaving] = useState(false);

  const [jumpDate, setJumpDate] = useState('');

  const [yearsDirty, setYearsDirty] = useState(false);
  const [termsDirty, setTermsDirty] = useState(false);

  const currentYear = years.data?.find((y) => y.isCurrent) ?? years.data?.[0];

  useConfirmDiscardOnLeave(
    (editingSettings &&
      (dueAt !== (settings.data?.attendanceDueAt ?? '') ||
        editMinutes !== String(settings.data?.attendanceEditMinutes ?? '') ||
        riskConsecutiveDays !== String(settings.data?.riskConsecutiveDays ?? '') ||
        riskAttendancePct !== String(settings.data?.riskAttendancePct ?? ''))) ||
      yearsDirty ||
      termsDirty,
  );

  function startEdit() {
    if (settings.data) {
      setDueAt(settings.data.attendanceDueAt);
      setEditMinutes(String(settings.data.attendanceEditMinutes));
      setRiskConsecutiveDays(String(settings.data.riskConsecutiveDays));
      setRiskAttendancePct(String(settings.data.riskAttendancePct));
    }
    setEditingSettings(true);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await updateSchoolSettings({
        attendance_due_at: dueAt,
        attendance_edit_minutes: Number(editMinutes) || undefined,
        risk_consecutive_days: Number(riskConsecutiveDays) || undefined,
        risk_attendance_pct: Number(riskAttendancePct) || undefined,
      });
      setEditingSettings(false);
      await queryClient.invalidateQueries({ queryKey: ['calendar', 'settings'] });
    } finally {
      setSaving(false);
    }
  }

  async function toggleWeekday(iso: number) {
    const current = weekdays.data ?? [1, 2, 3, 4, 5];
    const next = current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso].sort();
    await updateWorkingWeekdays(next);
    await queryClient.invalidateQueries({ queryKey: ['calendar', 'working-weekdays'] });
  }

  function confirmDeleteDay(onDate: string) {
    Alert.alert('Remove this override?', `${toDMY(onDate)} will follow the normal term/working-day rules again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void doDeleteDay(onDate) },
    ]);
  }

  async function doDeleteDay(onDate: string) {
    await deleteCalendarDay(onDate);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['calendar', 'all-days'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar', 'day'] }),
      queryClient.invalidateQueries({ queryKey: ['calendar', 'days-range'] }),
    ]);
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="calendar-outline" bottomIcon="time-outline" />
        <ScreenHeader
          title="Academic calendar"
          subtitle={currentYear ? `Year ${currentYear.label}` : settings.data?.schoolName}
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        <YearsSection
          years={years.data ?? []}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['calendar'] })}
          onDirtyChange={setYearsDirty}
        />

        <TermsSection
          years={years.data ?? []}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['calendar', 'terms'] });
            queryClient.invalidateQueries({ queryKey: ['calendar', 'terms-for-year'] });
          }}
          onDirtyChange={setTermsDirty}
        />

        <Card>
          <SectionHeader icon="today-outline" label="WORKING DAYS" />
          <View style={styles.dayRow}>
            {WEEKDAY_LABELS.map((w) => {
              const active = (weekdays.data ?? []).includes(w.iso);
              return (
                <Pressable
                  key={w.iso}
                  accessibilityRole="button"
                  accessibilityLabel={w.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => void toggleWeekday(w.iso)}
                  style={[styles.dayCircle, active && styles.dayCircleActive]}
                >
                  <Text style={[styles.dayCircleLabel, active && styles.dayCircleLabelActive]}>{w.letter}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>{(weekdays.data ?? []).length} school day(s) a week.</Text>
        </Card>

        <Card>
          <SectionHeader
            icon="shield-checkmark-outline"
            label="RULES"
            accessory={!editingSettings ? <Button label="Edit" size="sm" variant="ghost" icon="create-outline" onPress={startEdit} /> : undefined}
          />
          {editingSettings ? (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <TextField label="Due at (HH:MM)" value={dueAt} onChangeText={setDueAt} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Edit window (min)" value={editMinutes} onChangeText={setEditMinutes} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <TextField label="Consecutive risk (days)" value={riskConsecutiveDays} onChangeText={setRiskConsecutiveDays} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Attendance risk (%)" value={riskAttendancePct} onChangeText={setRiskAttendancePct} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Button label="Save" size="sm" onPress={() => void saveSettings()} loading={saving} />
                <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditingSettings(false)} />
              </View>
            </View>
          ) : settings.data ? (
            <View style={styles.ruleGrid}>
              <RuleStat icon="time-outline" label="Due at" value={settings.data.attendanceDueAt} />
              <RuleStat icon="hourglass-outline" label="Edit window" value={`${settings.data.attendanceEditMinutes} min`} />
              <RuleStat icon="warning-outline" label="Consecutive risk" value={`${settings.data.riskConsecutiveDays} days`} />
              <RuleStat icon="trending-down-outline" label="Attendance risk" value={`${settings.data.riskAttendancePct}%`} />
            </View>
          ) : null}
        </Card>

        <Card>
          <SectionHeader icon="create-outline" label="EDIT A DAY" />
          <DateField label="Date" value={jumpDate} onChangeText={(t) => setJumpDate(formatDMYInput(t))} onPickIso={(iso) => setJumpDate(toDMY(iso))} />
          <Button
            label="Open"
            icon="arrow-forward-circle-outline"
            disabled={!parseDMY(jumpDate)}
            onPress={() => {
              const isoJumpDate = parseDMY(jumpDate);
              if (isoJumpDate) navigation.navigate('CalendarDayEditor', { date: isoJumpDate });
            }}
          />

          {allDays.data && allDays.data.length > 0 ? (
            <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
              <Text style={styles.subLabel}>EDITED DAYS</Text>
              {allDays.data.map((d) => {
                const meta = DAY_TYPE_META[d.dayType];
                const tone = pillToneColors[meta.tone];
                return (
                  <View key={d.onDate} style={styles.itemRow}>
                    <Pressable onPress={() => navigation.navigate('CalendarDayEditor', { date: d.onDate })} style={[styles.itemRowMain, { flex: 1 }]}>
                      <View style={[styles.itemIconChip, { backgroundColor: tone.bg }]}>
                        <Icon name={meta.icon} size={16} color={tone.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{toDMY(d.onDate)}</Text>
                        {d.label ? <Text style={styles.itemCaption}>{d.label}</Text> : null}
                      </View>
                      <StatusPill label={meta.label} tone={meta.tone} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove override for ${d.onDate}`}
                      hitSlop={8}
                      onPress={() => confirmDeleteDay(d.onDate)}
                      style={{ padding: spacing.xs }}
                    >
                      <Icon name="trash-outline" size={16} color={colors.error} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : allDays.data ? (
            <Text style={styles.hint}>No overrides yet — pick a date above to add one.</Text>
          ) : null}
        </Card>
      </View>
    </Screen>
  );
}

function RuleStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.ruleStat}>
      <View style={styles.ruleStatIconChip}>
        <Icon name={icon} size={16} color={semantic.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleStatLabel}>{label}</Text>
        <Text style={styles.ruleStatValue}>{value}</Text>
      </View>
    </View>
  );
}

function YearsSection({
  years,
  onChanged,
  onDirtyChange,
}: {
  years: AcademicYear[];
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const dirty = formOpen && (!!label.trim() || !!start.trim() || !!end.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  // The Delete icon only appears once we've confirmed nothing else references this year — default stays hidden while that check is in flight or if it fails.
  useEffect(() => {
    if (!editingId) {
      setCanDelete(false);
      return;
    }
    let cancelled = false;
    setCanDelete(false);
    canDeleteAcademicYear(editingId)
      .then((ok) => { if (!cancelled) setCanDelete(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  function openAdd() {
    setEditingId(null);
    setLabel('');
    setStart('');
    setEnd('');
    setFormOpen(true);
  }

  function openEdit(y: AcademicYear) {
    setEditingId(y.id);
    setLabel(y.label);
    setStart(toDMY(y.startsOn));
    setEnd(toDMY(y.endsOn));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setLabel('');
    setStart('');
    setEnd('');
  }

  async function save() {
    if (!label.trim() || !start.trim() || !end.trim()) return;
    const isoStart = parseDMY(start);
    const isoEnd = parseDMY(end);
    if (!isoStart || !isoEnd) {
      Alert.alert('Invalid date', 'Enter dates as DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) await updateAcademicYear(editingId, { label: label.trim(), startsOn: isoStart, endsOn: isoEnd });
      else await addAcademicYear({ label: label.trim(), startsOn: isoStart, endsOn: isoEnd });
      closeForm();
      onChanged();
    } catch {
      Alert.alert(
        editingId ? 'Could not update the academic year' : 'Could not create the academic year',
        'Check the dates and that you have permission to edit the calendar.',
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this academic year?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteAcademicYear(editingId);
      closeForm();
      onChanged();
    } catch (err) {
      Alert.alert(
        'Could not delete this academic year',
        isForeignKeyViolation(err) ? 'This year still has classes, students, or other records linked to it — remove those first.' : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <SectionHeader
        icon="calendar-number-outline"
        label="ACADEMIC YEARS"
        accessory={!formOpen ? <Button label="Add year" size="sm" variant="ghost" icon="add-circle-outline" onPress={openAdd} /> : undefined}
      />
      {years.length === 0 && !formOpen ? <EmptyState icon="calendar-number-outline" title="No academic years yet" message="Add one to get started." /> : null}
      {years.map((y) => {
        const active = editingId === y.id;
        return (
          <Pressable key={y.id} onPress={() => openEdit(y)} style={[styles.itemRowMain, active && styles.itemRowMainActive]}>
            <View style={[styles.itemIconChip, { backgroundColor: y.isCurrent ? colors.successBg : semantic.primaryMuted }]}>
              <Icon name="calendar-outline" size={16} color={y.isCurrent ? colors.success : semantic.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{y.label}</Text>
              <Text style={styles.itemCaption}>
                {toDMY(y.startsOn)} → {toDMY(y.endsOn)}
              </Text>
            </View>
            {y.isCurrent ? <StatusPill label="Current" tone="success" /> : null}
          </Pressable>
        );
      })}
      {formOpen ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Label (e.g. 2027)" value={label} onChangeText={setLabel} />
          <DateField label="Starts on" value={start} onChangeText={(t) => setStart(formatDMYInput(t))} onPickIso={(iso) => setStart(toDMY(iso))} />
          <DateField label="Ends on" value={end} onChangeText={(t) => setEnd(formatDMYInput(t))} onPickIso={(iso) => setEnd(toDMY(iso))} />
          {!editingId ? (
            <Text style={styles.hint}>The current year is set automatically once today&apos;s date falls within it.</Text>
          ) : null}
          <FormActions onSave={() => void save()} onCancel={closeForm} busy={saving} onDelete={editingId && canDelete ? confirmDelete : undefined} deleteBusy={deleting} />
        </View>
      ) : null}
    </Card>
  );
}

function TermsSection({
  years,
  onChanged,
  onDirtyChange,
}: {
  years: AcademicYear[];
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [pickedYearId, setPickedYearId] = useState<string | undefined>(undefined);
  // Defaults to the current year until the user picks a different one — derived inline so there's
  // no render-then-setState round trip while the years query is still loading.
  const yearId = pickedYearId ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id;
  const terms = useTermsForYear(yearId);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  function pickYear(id: string) {
    setPickedYearId(id);
    closeForm();
  }

  const dirty = formOpen && (!!name.trim() || !!sequence.trim() || !!start.trim() || !!end.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  // The Delete icon only appears once we've confirmed nothing else references this term — default stays hidden while that check is in flight or if it fails.
  useEffect(() => {
    if (!editingId) {
      setCanDelete(false);
      return;
    }
    let cancelled = false;
    setCanDelete(false);
    canDeleteTerm(editingId)
      .then((ok) => { if (!cancelled) setCanDelete(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  function openAdd() {
    setEditingId(null);
    setName('');
    setSequence('');
    setStart('');
    setEnd('');
    setFormOpen(true);
  }

  function openEdit(t: Term) {
    setEditingId(t.id);
    setName(t.name);
    setSequence(String(t.sequence));
    setStart(toDMY(t.startsOn));
    setEnd(toDMY(t.endsOn));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setName('');
    setSequence('');
    setStart('');
    setEnd('');
  }

  async function save() {
    if (!name.trim() || !sequence.trim() || !start.trim() || !end.trim()) return;
    if (!editingId && !yearId) return;
    const isoStart = parseDMY(start);
    const isoEnd = parseDMY(end);
    if (!isoStart || !isoEnd) {
      Alert.alert('Invalid date', 'Enter dates as DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateTerm(editingId, { name: name.trim(), sequence: Number(sequence), startsOn: isoStart, endsOn: isoEnd });
      } else {
        await addTerm({ academicYearId: yearId as string, name: name.trim(), sequence: Number(sequence), startsOn: isoStart, endsOn: isoEnd });
      }
      closeForm();
      onChanged();
    } catch {
      Alert.alert(
        editingId ? 'Could not update the term' : 'Could not create the term',
        'Terms within a year may not overlap — check the dates.',
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this term?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteTerm(editingId);
      closeForm();
      onChanged();
    } catch (err) {
      Alert.alert(
        'Could not delete this term',
        isForeignKeyViolation(err) ? 'This term still has mark sheets or attendance summaries linked to it — remove those first.' : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <SectionHeader
        icon="bookmark-outline"
        label="TERMS"
        accessory={!formOpen && yearId ? <Button label="Add term" size="sm" variant="ghost" icon="add-circle-outline" onPress={openAdd} /> : undefined}
      />

      {years.length === 0 ? (
        <EmptyState icon="calendar-number-outline" title="No academic years yet" message="Create one in Academic Years above." />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.sm }}>
          {years.map((y) => (
            <YearChip key={y.id} year={y} active={y.id === yearId} onPress={() => pickYear(y.id)} onSurface />
          ))}
        </ScrollView>
      )}

      {(terms.data ?? []).map((t) => {
        const active = editingId === t.id;
        const current = isCurrentPeriod(t.startsOn, t.endsOn);
        return (
          <Pressable key={t.id} onPress={() => openEdit(t)} style={[styles.itemRowMain, active && styles.itemRowMainActive]}>
            <View style={[styles.itemIconChip, { backgroundColor: current ? colors.successBg : semantic.primaryMuted }]}>
              <Text style={[styles.itemIconChipText, { color: current ? colors.success : semantic.primary }]}>{t.sequence}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{t.name}</Text>
              <Text style={styles.itemCaption}>
                {toDMY(t.startsOn)} → {toDMY(t.endsOn)}
              </Text>
            </View>
            {current ? <StatusPill label="Current" tone="success" /> : null}
          </Pressable>
        );
      })}
      {yearId && terms.data?.length === 0 && !formOpen ? (
        <EmptyState icon="bookmark-outline" title="No terms yet" message="Add the first term for this year." />
      ) : null}

      {formOpen ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Name (e.g. Term 1)" value={name} onChangeText={setName} />
          <TextField label="Sequence (1, 2, 3...)" value={sequence} onChangeText={setSequence} keyboardType="numeric" />
          <DateField label="Starts on" value={start} onChangeText={(t) => setStart(formatDMYInput(t))} onPickIso={(iso) => setStart(toDMY(iso))} />
          <DateField label="Ends on" value={end} onChangeText={(t) => setEnd(formatDMYInput(t))} onPickIso={(iso) => setEnd(toDMY(iso))} />
          <FormActions onSave={() => void save()} onCancel={closeForm} busy={saving} onDelete={editingId && canDelete ? confirmDelete : undefined} deleteBusy={deleting} />
        </View>
      ) : null}
    </Card>
  );
}

function FormActions({
  onSave,
  onCancel,
  busy,
  onDelete,
  deleteBusy,
}: {
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: onDelete ? 'space-between' : 'flex-start', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <Button label="Save" size="sm" onPress={onSave} loading={busy} />
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
      </View>
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete" hitSlop={8} disabled={deleteBusy} onPress={onDelete} style={{ padding: spacing.xs }}>
          {deleteBusy ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={16} color={colors.error} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  subLabel: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  hint: { ...typography.caption, color: semantic.textSecondary },

  itemRowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md },
  itemRowMainActive: { backgroundColor: semantic.primaryMuted, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemIconChip: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  itemIconChipText: { ...typography.captionStrong },
  itemTitle: { ...typography.bodyStrong, color: semantic.textPrimary },
  itemCaption: { ...typography.caption, color: semantic.textSecondary, marginTop: 1 },

  dayRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.sm },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
  },
  dayCircleActive: { backgroundColor: semantic.primary, borderColor: semantic.primary },
  dayCircleLabel: { ...typography.bodyStrong, color: semantic.textSecondary },
  dayCircleLabelActive: { color: colors.white },

  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  ruleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ruleStat: { width: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: semantic.surfaceAlt, borderRadius: radius.md, padding: spacing.sm },
  ruleStatIconChip: { width: 30, height: 30, borderRadius: radius.md, backgroundColor: semantic.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  ruleStatLabel: { ...typography.caption, color: semantic.textSecondary },
  ruleStatValue: { ...typography.bodyStrong, color: semantic.textPrimary },
});
