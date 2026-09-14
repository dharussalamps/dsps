import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Avatar,
  Button,
  Card,
  DateField,
  EmptyState,
  FloatingActionButton,
  HeaderIconButton,
  Hero,
  HeroDoodle,
  Icon,
  Screen,
  ScreenHeader,
  SectionHeader,
  TextField,
} from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { todayIso } from '@/features/attendance/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { useAuthStore } from '@/store/authStore';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { addDiaryEntry, deleteDiaryEntry, updateDiaryEntry, type DiaryEntry } from './api';
import { DateTile } from './DateTile';
import { downloadDiaryListPdf } from './diaryPdf';
import { useDiaryEntriesInMonth, useDiaryEntriesInYear } from './hooks';

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i).toLocaleString([], { month: 'long' }));

export function DiaryScreen() {
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);
  const isPrincipal = useIsPrincipal();
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  // null = "All" — the whole year, not just one month. Defaults to the current month.
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const monthEntries = useDiaryEntriesInMonth(year, month ?? 1, month !== null);
  const yearEntries = useDiaryEntriesInYear(year, month === null);
  const entries = month === null ? yearEntries : monthEntries;
  const items = entries.data ?? [];

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(() => toDMY(todayIso()));
  const [dateError, setDateError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useConfirmDiscardOnLeave(formOpen && (!!title.trim() || !!body.trim()));

  const periodLabel = month === null ? `${year} (All months)` : `${MONTH_NAMES[month - 1]} ${year}`;

  function shiftPeriod(delta: number) {
    if (month === null) {
      setYear((y) => y + delta);
      return;
    }
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

  function openAdd() {
    setEditingId(null);
    setTitle('');
    setBody('');
    setDate(toDMY(todayIso()));
    setDateError(undefined);
    setFormOpen(true);
  }

  function openEdit(entry: DiaryEntry) {
    setEditingId(entry.id);
    setTitle(entry.title);
    setBody(entry.body ?? '');
    setDate(toDMY(entry.onDate));
    setDateError(undefined);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  async function submit() {
    if (!staff || !title.trim()) return;
    const isoDate = parseDMY(date);
    if (!isoDate) {
      setDateError('Enter a valid date as DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateDiaryEntry(editingId, { onDate: isoDate, title: title.trim(), body: body.trim() });
      } else {
        await addDiaryEntry({ onDate: isoDate, title: title.trim(), body: body.trim(), authorId: staff.id });
      }
      closeForm();
      // Broad prefix invalidates both the month and year list queries.
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(id: string) {
    Alert.alert('Delete this diary entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete(id) },
    ]);
  }

  async function doDelete(id: string) {
    try {
      await deleteDiaryEntry(id);
      closeForm();
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
    } catch (err) {
      Alert.alert('Could not delete this entry', err instanceof Error ? err.message : 'Something went wrong — try again.');
    }
  }

  async function handleDownloadPdf() {
    setExporting(true);
    try {
      await downloadDiaryListPdf(periodLabel, items);
    } catch {
      Alert.alert('Could not create PDF', 'Something went wrong — try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="book-outline" bottomIcon="create-outline" />
        <ScreenHeader title="School diary" tone="onPrimary" back={navigation.canGoBack()} hideBell>
          <HeaderIconButton
            icon="download-outline"
            accessibilityLabel="Download PDF"
            loading={exporting}
            disabled={items.length === 0}
            onPress={() => void handleDownloadPdf()}
          />
        </ScreenHeader>

        <View style={styles.navRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous" hitSlop={8} onPress={() => shiftPeriod(-1)} style={styles.navBtn}>
            <Icon name="chevron-back" size={18} color={colors.white} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.periodTrigger}>
            <Icon name="calendar-outline" size={15} color={colors.white} />
            <Text style={styles.periodLabel}>{periodLabel}</Text>
            <Icon name="chevron-down" size={14} color={colors.white} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Next" hitSlop={8} onPress={() => shiftPeriod(1)} style={styles.navBtn}>
            <Icon name="chevron-forward" size={18} color={colors.white} />
          </Pressable>
        </View>

        <PeriodPickerModal
          visible={pickerOpen}
          year={year}
          month={month}
          onClose={() => setPickerOpen(false)}
          onChangeYear={setYear}
          onChangeMonth={setMonth}
        />
      </Hero>

      {entries.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl + spacing.xxxl }}
          ListHeaderComponent={
            formOpen ? (
              <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
                <SectionHeader
                  icon={editingId ? 'create-outline' : 'add-circle-outline'}
                  label={editingId ? 'EDIT ENTRY' : 'NEW ENTRY'}
                  accessory={
                    editingId && isPrincipal ? (
                      <Button
                        label=""
                        accessibilityLabel="Delete entry"
                        icon="trash-outline"
                        size="sm"
                        variant="ghost"
                        textColor={colors.error}
                        onPress={() => confirmDelete(editingId)}
                      />
                    ) : null
                  }
                />
                <TextField label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Sports day, inspection visit" />
                <DateField
                  label="Date"
                  value={date}
                  onChangeText={(t) => {
                    setDate(formatDMYInput(t));
                    setDateError(undefined);
                  }}
                  onPickIso={(iso) => {
                    setDate(toDMY(iso));
                    setDateError(undefined);
                  }}
                  error={dateError}
                />
                <TextField label="Notes" value={body} onChangeText={setBody} placeholder="What happened today?" multiline />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Cancel" variant="ghost" onPress={closeForm} style={{ flex: 1 }} />
                  <Button label="Save" onPress={() => void submit()} loading={saving} disabled={!title.trim()} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="book-outline"
              title={month === null ? 'No diary entries this year' : 'No diary entries this month'}
              message="Tap the + button to record what happened."
            />
          }
          renderItem={({ item }) => <DiaryRow item={item} canEdit={isPrincipal} onEdit={() => openEdit(item)} />}
        />
      )}

      {isPrincipal && !formOpen ? <FloatingActionButton icon="add" accessibilityLabel="Add entry" onPress={openAdd} /> : null}
    </Screen>
  );
}

function DiaryRow({ item, canEdit, onEdit }: { item: DiaryEntry; canEdit: boolean; onEdit: () => void }) {
  return (
    <Card flat style={styles.row}>
      <DateTile iso={item.onDate} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {item.title}
          </Text>
          {canEdit ? (
            <Button label="" accessibilityLabel="Edit entry" icon="create-outline" size="sm" variant="ghost" onPress={onEdit} style={styles.editBtn} />
          ) : null}
        </View>
        {item.authorName ? (
          <View style={styles.authorRow}>
            <Avatar name={item.authorName} size={16} />
            <Text style={styles.authorName} numberOfLines={1}>
              {item.authorName}
            </Text>
          </View>
        ) : null}
        {item.body ? (
          <Text style={{ ...typography.body, color: semantic.textPrimary }} numberOfLines={4}>
            {item.body}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

type PeriodPickerModalProps = {
  visible: boolean;
  year: number;
  /** null = "All" (the whole year). */
  month: number | null;
  onClose: () => void;
  onChangeYear: (year: number) => void;
  onChangeMonth: (month: number | null) => void;
};

/** One combined picker instead of a separate Month/Year tab switch: the year row at
 * top always narrows down to a specific year, and the row below picks either "All"
 * (every entry that year) or one specific month within it — tapping either closes
 * the modal immediately. Mirrors EventCalendarScreen's own PeriodPickerModal. */
function PeriodPickerModal({ visible, year, month, onClose, onChangeYear, onChangeMonth }: PeriodPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.yearRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous year" hitSlop={8} onPress={() => onChangeYear(year - 1)} style={styles.yearNavBtn}>
              <Icon name="chevron-back" size={18} color={semantic.primary} />
            </Pressable>
            <Text style={styles.yearLabel}>{year}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next year" hitSlop={8} onPress={() => onChangeYear(year + 1)} style={styles.yearNavBtn}>
              <Icon name="chevron-forward" size={18} color={semantic.primary} />
            </Pressable>
          </View>

          <Button
            label="All months (whole year)"
            icon="grid-outline"
            size="sm"
            variant={month === null ? 'primary' : 'outline'}
            onPress={() => {
              onChangeMonth(null);
              onClose();
            }}
            style={{ alignSelf: 'stretch' }}
          />

          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((label, i) => (
              <Button
                key={label}
                label={label.slice(0, 3)}
                size="sm"
                variant={month === i + 1 ? 'primary' : 'outline'}
                onPress={() => {
                  onChangeMonth(i + 1);
                  onClose();
                }}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  periodTrigger: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  periodLabel: { ...typography.bodyStrong, color: colors.white },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  editBtn: { width: 32, height: 32, minHeight: 32, paddingHorizontal: 0, borderRadius: radius.pill, backgroundColor: semantic.primaryMuted },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  authorName: { ...typography.caption, color: semantic.textSecondary, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 320,
    maxWidth: '90%',
    backgroundColor: semantic.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.raised,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  yearNavBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.primaryMuted },
  yearLabel: { ...typography.title, color: semantic.textPrimary, minWidth: 64, textAlign: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
