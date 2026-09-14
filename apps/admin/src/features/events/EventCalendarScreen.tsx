import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, FloatingActionButton, HeaderIconButton, Hero, HeroDoodle, Icon, Screen, ScreenHeader, StatusPill } from '@/components';
import type { IconName } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { createEvent, type EventSummary } from './api';
import { DateTile } from './DateTile';
import { categoryStyle } from './eventCategories';
import { EventForm, type EventFormPayload } from './EventForm';
import { eventStatus } from './eventStatus';
import { downloadEventListPdf } from './eventsPdf';
import { useEventsInMonth, useEventsInYear } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => new Date(2000, i).toLocaleString([], { month: 'long' }));

export function EventCalendarScreen() {
  const navigation = useNavigation<Nav>();
  const staff = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  // null = "All" — the whole year, not just one month. Defaults to the current month.
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const monthEvents = useEventsInMonth(year, month ?? 1, month !== null);
  const yearEvents = useEventsInYear(year, month === null);
  const events = month === null ? yearEvents : monthEvents;
  const items = events.data ?? [];

  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const periodLabel = month === null ? `${year} (All months)` : `${MONTH_NAMES[month - 1]} ${year}`;
  const completedCount = items.filter((i) => i.completedAt).length;
  const pendingCount = items.filter((i) => eventStatus(i)?.tone === 'warning').length;

  async function handleDownloadPdf() {
    setExporting(true);
    try {
      await downloadEventListPdf(periodLabel, items);
    } catch {
      Alert.alert('Could not create PDF', 'Something went wrong — try again.');
    } finally {
      setExporting(false);
    }
  }

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

  async function handleCreate(payload: EventFormPayload) {
    if (!staff) return;
    await createEvent({ ...payload, createdBy: staff.id });
    setAdding(false);
    // Broad prefix invalidates both the month and year list queries (and leaves
    // ['events', 'detail', id] alone — nothing to refresh there for a new event).
    await queryClient.invalidateQueries({ queryKey: ['events'] });
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="star-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Events" tone="onPrimary" back={navigation.canGoBack()} hideBell>
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

        {events.isLoading ? (
          <ActivityIndicator color={colors.white} style={{ marginTop: spacing.xs }} />
        ) : (
          <View style={styles.statsRow}>
            <StatChip icon="calendar-outline" value={String(items.length)} label="Events" tone="neutral" />
            <StatChip icon="checkmark-done-outline" value={String(completedCount)} label="Completed" tone="success" />
            <StatChip icon="time-outline" value={String(pendingCount)} label="Pending" tone="warning" />
          </View>
        )}
      </Hero>

      {events.isLoading ? (
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxxl + spacing.xxxl }}
          ListHeaderComponent={
            adding ? (
              <View style={{ marginBottom: spacing.md }}>
                <EventForm
                  headerLabel="NEW EVENT"
                  submitLabel="Save event"
                  confirmTitle="Save this event?"
                  onSubmit={handleCreate}
                  onCancel={() => setAdding(false)}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={month === null ? 'No events this year' : 'No events this month'}
              message="Tap the + button to schedule the next one."
            />
          }
          renderItem={({ item }) => <EventRow item={item} onPress={() => navigation.navigate('EventDetail', { eventId: item.id })} />}
        />
      )}

      {!adding ? (
        <FloatingActionButton icon="add" accessibilityLabel="Add event" onPress={() => setAdding(true)} />
      ) : null}
    </Screen>
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
 * (every event that year) or one specific month within it — tapping either closes
 * the modal immediately, matching how the day-picker's own month step behaves. */
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
            onPress={() => { onChangeMonth(null); onClose(); }}
            style={{ alignSelf: 'stretch' }}
          />

          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((label, i) => (
              <Button
                key={label}
                label={label.slice(0, 3)}
                size="sm"
                variant={month === i + 1 ? 'primary' : 'outline'}
                onPress={() => { onChangeMonth(i + 1); onClose(); }}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EventRow({ item, onPress }: { item: EventSummary; onPress: () => void }) {
  const status = eventStatus(item);
  const cat = categoryStyle(item.category);

  return (
    <Card onPress={onPress} flat style={styles.row}>
      <DateTile iso={item.startsOn} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 }} numberOfLines={1}>
            {item.title}
          </Text>
          {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
        </View>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
          {item.startsOn}
          {item.endsOn ? ` → ${item.endsOn}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
          {item.category ? (
            <View style={styles.categoryChip}>
              <Icon name={cat.icon} size={11} color={semantic.textSecondary} />
              <Text style={styles.categoryChipText}>{item.category}</Text>
            </View>
          ) : null}
          {item.responsible.length > 0 ? (
            <View style={styles.avatarStack}>
              {item.responsible.slice(0, 3).map((r, i) => (
                <View key={r.id} style={[styles.avatarRing, i > 0 && styles.avatarRingOverlap]}>
                  <Avatar name={r.fullName} size={18} />
                </View>
              ))}
              {item.responsible.length > 3 ? <Text style={styles.avatarOverflow}>+{item.responsible.length - 3}</Text> : null}
            </View>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-forward" size={16} color={semantic.textSecondary} />
    </Card>
  );
}

const chipTones = {
  neutral: { bg: 'rgba(255,255,255,0.14)', border: 'rgba(255,255,255,0.3)', fg: colors.white, sub: colors.cream100 },
  success: { bg: 'rgba(20,107,68,0.32)', border: 'rgba(228,245,236,0.4)', fg: colors.white, sub: colors.successBg },
  warning: { bg: 'rgba(169,130,60,0.32)', border: 'rgba(243,230,200,0.4)', fg: colors.white, sub: colors.gold100 },
} as const;

function StatChip({ icon, value, label, tone = 'neutral' }: { icon: IconName; value: string; label: string; tone?: keyof typeof chipTones }) {
  const t = chipTones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={styles.chipIcon}>
        <Icon name={icon} size={13} color={t.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.chipValue, { color: t.fg }]} numberOfLines={1}>
          {value}
        </Text>
        <Text style={[styles.chipLabel, { color: t.sub }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
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
  statsRow: { flexDirection: 'row', gap: spacing.sm },
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
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  chipIcon: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  chipValue: { ...typography.bodyStrong },
  chipLabel: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: semantic.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  categoryChipText: { ...typography.caption, fontSize: 11, color: semantic.textSecondary },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  avatarRing: { borderRadius: radius.pill, borderWidth: 2, borderColor: semantic.surface },
  avatarRingOverlap: { marginLeft: -8 },
  avatarOverflow: { ...typography.caption, fontSize: 11, color: semantic.textSecondary, marginLeft: spacing.xs },
});
