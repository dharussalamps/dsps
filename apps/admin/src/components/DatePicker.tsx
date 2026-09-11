import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Button } from './Button';
import { Icon } from './Icon';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => format(setMonth(new Date(), i), 'MMM'));

type Props = {
  /** YYYY-MM-DD */
  value: string;
  onChange: (isoDate: string) => void;
  /** YYYY-MM-DD — dates after this are shown but not selectable. */
  maxDate?: string;
};

/** A button showing the selected date; tapping it opens a month-grid calendar modal. No native module — this app has none installed for dates (see AdminSpec.md's own note on that). */
export function DatePicker({ value, onChange, maxDate }: Props) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <Icon name="calendar-outline" size={15} color={colors.white} />
        <Text style={styles.triggerLabel}>{format(selected, 'EEE, d MMM yyyy')}</Text>
        <Icon name="chevron-down" size={14} color={colors.white} />
      </Pressable>

      <CalendarModal
        visible={open}
        value={value}
        onChange={onChange}
        onClose={() => setOpen(false)}
        maxDate={maxDate}
      />
    </>
  );
}

type CalendarModalProps = {
  visible: boolean;
  onClose: () => void;
  /** YYYY-MM-DD — the month grid opens on this date's month; falls back to today when empty/invalid. */
  value?: string;
  onChange: (isoDate: string) => void;
  /** YYYY-MM-DD — dates after this are shown but not selectable. */
  maxDate?: string;
  /** YYYY-MM-DD — dates before this are shown but not selectable. Defaults to 100 years before maxDate/today. */
  minDate?: string;
  /**
   * 'nav' (default): month-by-month prev/next arrows, suited to picking a
   * recent date. 'yearFirst': opens on a year grid, then a month grid,
   * before landing on the day grid — for a date like a birthdate that could
   * be many years back, where stepping month by month is impractical.
   */
  mode?: 'nav' | 'yearFirst';
  /** Optional per-day marker (e.g. school day vs holiday) — a colored badge behind the day number. Returning undefined renders no marker for that day. */
  dayTone?: (isoDate: string) => 'school' | 'off' | undefined;
  /** When true, a day dayTone marks 'off' can't be picked — for leave types that only make sense against a school day. Ignored if dayTone isn't set. */
  blockOffDays?: boolean;
};

type Step = 'year' | 'month' | 'day';

/** The bare month-grid calendar, as a controlled modal — shared by DatePicker's own pill trigger and any other caller (e.g. a calendar icon next to a typed date field) that wants the same picker without that trigger's styling. */
export function CalendarModal({ visible, onClose, value, onChange, maxDate, minDate, mode = 'nav', dayTone, blockOffDays }: CalendarModalProps) {
  const selected = value ? parseISO(value) : new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected));
  const [step, setStep] = useState<Step>(mode === 'yearFirst' ? 'year' : 'day');
  const max = maxDate ? parseISO(maxDate) : null;
  const min = minDate ? parseISO(minDate) : null;

  // Re-centers the grid (and, for yearFirst, jumps back to the year step)
  // each time the modal opens — a render-time state adjustment (React's
  // sanctioned alternative to an effect here) rather than a `useEffect`,
  // since setting state from inside an effect body just to sync it from a
  // prop change causes an extra, avoidable re-render.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setVisibleMonth(startOfMonth(selected));
      setStep(mode === 'yearFirst' ? 'year' : 'day');
    }
  }

  function pick(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'));
    onClose();
  }

  const gridStart = startOfWeek(startOfMonth(visibleMonth));
  const gridEnd = endOfWeek(endOfMonth(visibleMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const isOnToday = isSameDay(selected, new Date());

  const maxYear = (max ?? new Date()).getFullYear();
  const minYear = min ? min.getFullYear() : maxYear - 100;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {step === 'year' ? (
            <>
              <Text style={[styles.monthLabel, styles.stepTitle]}>Select year</Text>
              <ScrollView style={styles.chipScroll}>
                <View style={styles.chipGrid}>
                  {years.map((y) => (
                    <Button
                      key={y}
                      label={String(y)}
                      size="sm"
                      variant={y === visibleMonth.getFullYear() ? 'primary' : 'outline'}
                      onPress={() => {
                        setVisibleMonth((m) => setYear(m, y));
                        setStep('month');
                      }}
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          ) : step === 'month' ? (
            <>
              <Pressable accessibilityRole="button" onPress={() => setStep('year')} style={styles.breadcrumb}>
                <Icon name="chevron-back" size={18} color={semantic.primary} />
                <Text style={styles.monthLabel}>{format(visibleMonth, 'yyyy')}</Text>
              </Pressable>
              <View style={styles.chipGrid}>
                {MONTH_LABELS.map((label, i) => {
                  const disabled = max ? isAfter(startOfMonth(setMonth(visibleMonth, i)), startOfMonth(max)) : false;
                  return (
                    <Button
                      key={label}
                      label={label}
                      size="sm"
                      disabled={disabled}
                      variant={i === visibleMonth.getMonth() ? 'primary' : 'outline'}
                      onPress={() => {
                        setVisibleMonth((m) => setMonth(m, i));
                        setStep('day');
                      }}
                    />
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <View style={styles.monthHeader}>
                <View style={styles.monthRow}>
                  {mode === 'yearFirst' ? (
                    <Pressable accessibilityRole="button" onPress={() => setStep('month')} style={styles.breadcrumb}>
                      <Icon name="chevron-back" size={18} color={semantic.primary} />
                      <Text style={styles.monthLabel}>{format(visibleMonth, 'MMMM yyyy')}</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Previous month"
                        hitSlop={8}
                        onPress={() => setVisibleMonth((m) => subMonths(m, 1))}
                        style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
                      >
                        <Icon name="chevron-back" size={18} color={semantic.primary} />
                      </Pressable>
                      <Text style={styles.monthLabel}>{format(visibleMonth, 'MMMM yyyy')}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Next month"
                        hitSlop={8}
                        onPress={() => setVisibleMonth((m) => addMonths(m, 1))}
                        style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
                      >
                        <Icon name="chevron-forward" size={18} color={semantic.primary} />
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={styles.weekRow}>
                  {WEEKDAY_LABELS.map((w, i) => (
                    <Text key={i} style={[styles.weekdayLabel, (i === 0 || i === 6) && styles.weekdayLabelWeekend]}>
                      {w}
                    </Text>
                  ))}
                </View>
              </View>

              <View style={styles.grid}>
                {days.map((day) => {
                  const inMonth = isSameMonth(day, visibleMonth);
                  const isSelected = !!value && isSameDay(day, selected);
                  const isToday = isSameDay(day, new Date());
                  const tone = dayTone?.(format(day, 'yyyy-MM-dd'));
                  const disabled = (max ? isAfter(day, max) : false) || (min ? isBefore(day, min) : false) || (blockOffDays && tone === 'off');
                  return (
                    <Pressable
                      key={day.toISOString()}
                      accessibilityRole="button"
                      disabled={disabled}
                      onPress={() => pick(day)}
                      style={[
                        styles.dayCell,
                        tone === 'school' && styles.dayCellSchool,
                        tone === 'off' && styles.dayCellOff,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayLabel,
                          !inMonth && styles.dayLabelOutside,
                          disabled && styles.dayLabelDisabled,
                          isSelected && styles.dayLabelSelected,
                          isToday && !isSelected && styles.dayLabelToday,
                        ]}
                      >
                        {format(day, 'd')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {dayTone ? (
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.dayCellSchool]} />
                    <Text style={styles.legendLabel}>School day</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendSwatch, styles.dayCellOff]} />
                    <Text style={styles.legendLabel}>Holiday / non-school day</Text>
                  </View>
                </View>
              ) : null}

              {mode === 'nav' && !isOnToday ? (
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.todayButton, pressed && { backgroundColor: semantic.primaryMuted }]}
                  onPress={() => pick(max && isAfter(new Date(), max) ? max : new Date())}
                >
                  <Icon name="today-outline" size={15} color={semantic.primary} />
                  <Text style={styles.todayButtonLabel}>Jump to today</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  triggerPressed: { backgroundColor: 'rgba(255,255,255,0.28)' },
  triggerLabel: { ...typography.captionStrong, color: colors.white },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 320,
    maxWidth: '90%',
    backgroundColor: semantic.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...elevation.raised,
  },
  monthHeader: {
    backgroundColor: semantic.primaryMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginHorizontal: -spacing.xs,
    marginBottom: spacing.sm,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  monthLabel: { ...typography.bodyStrong, color: semantic.textPrimary },
  navBtn: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  navBtnPressed: { backgroundColor: semantic.border },
  stepTitle: { marginBottom: spacing.sm },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: spacing.sm },
  chipScroll: { maxHeight: 280 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: { ...typography.captionStrong, color: semantic.textSecondary, width: `${100 / 7}%`, textAlign: 'center' },
  weekdayLabelWeekend: { color: colors.gold700 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayCellSchool: { backgroundColor: colors.successBg, borderRadius: radius.pill },
  dayCellOff: { backgroundColor: colors.cream100, borderRadius: radius.pill },
  dayCellToday: { borderWidth: 1.5, borderColor: semantic.primary, borderRadius: radius.pill },
  dayCellSelected: { backgroundColor: semantic.primary, borderRadius: radius.pill, ...elevation.card },
  dayLabel: { ...typography.body, color: semantic.textPrimary },
  dayLabelOutside: { color: colors.ink300 },
  dayLabelDisabled: { color: colors.ink300, opacity: 0.5 },
  dayLabelSelected: { color: colors.white, fontWeight: '700' },
  dayLabelToday: { color: semantic.primary, fontWeight: '700' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center', marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: radius.pill },
  legendLabel: { ...typography.caption, color: semantic.textSecondary },
  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semantic.primaryMuted,
  },
  todayButtonLabel: { ...typography.captionStrong, color: semantic.primary },
});
