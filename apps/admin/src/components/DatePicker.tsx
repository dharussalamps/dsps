import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon } from './Icon';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected));
  const max = maxDate ? parseISO(maxDate) : null;

  function openPicker() {
    setVisibleMonth(startOfMonth(selected));
    setOpen(true);
  }

  function pick(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'));
    setOpen(false);
  }

  const gridStart = startOfWeek(startOfMonth(visibleMonth));
  const gridEnd = endOfWeek(endOfMonth(visibleMonth));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const isOnToday = isSameDay(selected, new Date());

  return (
    <>
      <Pressable accessibilityRole="button" onPress={openPicker} style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <Icon name="calendar-outline" size={15} color={colors.white} />
        <Text style={styles.triggerLabel}>{format(selected, 'EEE, d MMM yyyy')}</Text>
        <Icon name="chevron-down" size={14} color={colors.white} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.monthRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                hitSlop={8}
                onPress={() => setVisibleMonth((m) => subMonths(m, 1))}
              >
                <Icon name="chevron-back" size={20} color={semantic.textPrimary} />
              </Pressable>
              <Text style={styles.monthLabel}>{format(visibleMonth, 'MMMM yyyy')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                hitSlop={8}
                onPress={() => setVisibleMonth((m) => addMonths(m, 1))}
              >
                <Icon name="chevron-forward" size={20} color={semantic.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAY_LABELS.map((w, i) => (
                <Text key={i} style={styles.weekdayLabel}>
                  {w}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {days.map((day) => {
                const inMonth = isSameMonth(day, visibleMonth);
                const isSelected = isSameDay(day, selected);
                const isToday = isSameDay(day, new Date());
                const disabled = max ? isAfter(day, max) : false;
                return (
                  <Pressable
                    key={day.toISOString()}
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => pick(day)}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
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

            {!isOnToday ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.todayButton, pressed && { backgroundColor: semantic.primaryMuted }]}
                onPress={() => pick(max && isAfter(new Date(), max) ? max : new Date())}
              >
                <Icon name="today-outline" size={15} color={semantic.primary} />
                <Text style={styles.todayButtonLabel}>Jump to today</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.55)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: 320, maxWidth: '90%', backgroundColor: semantic.surface, borderRadius: radius.xl, padding: spacing.lg, ...elevation.raised },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthLabel: { ...typography.bodyStrong, color: semantic.textPrimary },
  weekRow: { flexDirection: 'row' },
  weekdayLabel: { ...typography.caption, color: semantic.textSecondary, width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellSelected: { backgroundColor: semantic.primary, borderRadius: radius.pill },
  dayLabel: { ...typography.body, color: semantic.textPrimary },
  dayLabelOutside: { color: colors.ink300 },
  dayLabelDisabled: { color: colors.ink300, opacity: 0.5 },
  dayLabelSelected: { color: colors.white, fontWeight: '700' },
  dayLabelToday: { color: semantic.primary, fontWeight: '700' },
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
