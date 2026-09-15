import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/components';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import type { AcademicYear } from './api';

type Props = {
  year: AcademicYear;
  active: boolean;
  onPress: () => void;
  /**
   * True when the chip sits directly on a plain white/cream surface (e.g.
   * inside a Card) rather than the colored Hero band. The default styling is
   * translucent-white-on-maroon, tuned for the Hero; on a white surface an
   * inactive chip in that palette renders as white-on-white and disappears —
   * this swaps in a solid maroon-tint style instead, matching the pill chips
   * already used elsewhere on white surfaces (e.g. AcademicStructureScreen's
   * grade pills).
   */
  onSurface?: boolean;
};

/**
 * A single year chip for the horizontal year-pickers on Exams, Analytics,
 * Leave requests/allocation, Assign cover, and the Academic Calendar's Terms
 * card — pulled out as a shared component (those screens previously each
 * redefined an identical chip block) so the "current year" dot stays
 * consistent everywhere a year is picked instead of drifting across copies.
 */
export function YearChip({ year, active, onPress, onSurface }: Props) {
  const bg = onSurface ? (active ? semantic.primary : semantic.primaryMuted) : active ? colors.white : 'rgba(255,255,255,0.14)';
  const fg = onSurface ? (active ? colors.white : semantic.primary) : active ? semantic.primary : colors.white;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={year.isCurrent ? `${year.label}, current year` : year.label}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg }]}
    >
      <Icon name="calendar-outline" size={14} color={fg} />
      <Text style={[styles.chipLabel, { color: fg }]}>{year.label}</Text>
      {year.isCurrent ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  chipLabel: { ...typography.captionStrong },
  dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: colors.success },
});
