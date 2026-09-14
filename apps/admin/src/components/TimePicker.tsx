import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, elevation, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Button } from './Button';
import { Icon } from './Icon';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parses "HH:MM" (24-hour); falls back to the current time when empty/invalid. */
function parseTime(value: string | undefined): { hour: number; minute: number } {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }
  const now = new Date();
  return { hour: now.getHours(), minute: now.getMinutes() };
}

type TimePickerModalProps = {
  visible: boolean;
  onClose: () => void;
  /** HH:MM, 24-hour. */
  value?: string;
  onChange: (time: string) => void;
};

/** A grid picker (hour 00–23, minute in 15-minute steps) as a controlled modal — the same
 * chip-grid interaction as CalendarModal, since this app has no native time-picker module
 * installed (see DatePicker.tsx's own note on that for dates). */
export function TimePickerModal({ visible, onClose, value, onChange }: TimePickerModalProps) {
  const parsed = parseTime(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);

  // Re-syncs to the field's current value each time the modal opens — same render-time
  // adjustment CalendarModal uses instead of a useEffect (see its own comment on why).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setHour(parsed.hour);
      setMinute(parsed.minute);
    }
  }

  function confirm() {
    onChange(`${pad(hour)}:${pad(minute)}`);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Select time</Text>
          <Text style={styles.preview}>
            {pad(hour)}:{pad(minute)}
          </Text>

          <Text style={styles.groupLabel}>HOUR</Text>
          <ScrollView style={styles.hourScroll} contentContainerStyle={styles.chipGrid}>
            {HOURS.map((h) => (
              <Button key={h} label={pad(h)} size="sm" variant={h === hour ? 'primary' : 'outline'} onPress={() => setHour(h)} />
            ))}
          </ScrollView>

          <Text style={styles.groupLabel}>MINUTE</Text>
          <View style={styles.chipGrid}>
            {MINUTES.map((m) => (
              <Button key={m} label={pad(m)} size="sm" variant={m === minute ? 'primary' : 'outline'} onPress={() => setMinute(m)} />
            ))}
          </View>

          <Button label="Done" onPress={confirm} style={{ marginTop: spacing.sm }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type TimeFieldProps = {
  label: string;
  /** HH:MM, 24-hour, or '' when unset. */
  value: string;
  onChange: (time: string) => void;
  error?: string;
};

/** A tap-to-open time field matching DateField's shape — a labeled box showing the picked
 * time (or a placeholder), opening TimePickerModal instead of a free-typed HH:MM string that
 * was easy to mistype. */
export function TimeField({ label, value, onChange, error }: TimeFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Pick ${label.toLowerCase()}`}
        onPress={() => setOpen(true)}
        style={[styles.fieldBox, error && styles.fieldBoxError]}
      >
        <Icon name="time-outline" size={18} color={semantic.primary} />
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>{value || 'Time'}</Text>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <TimePickerModal visible={open} value={value} onChange={onChange} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { ...typography.captionStrong, color: semantic.textSecondary },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTapTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
  },
  fieldBoxError: { borderColor: colors.error },
  fieldValue: { ...typography.body, color: semantic.textPrimary },
  fieldPlaceholder: { color: colors.ink300 },
  fieldError: { ...typography.caption, color: colors.error },
  backdrop: { flex: 1, backgroundColor: 'rgba(24,10,13,0.6)', alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 320,
    maxWidth: '90%',
    backgroundColor: semantic.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...elevation.raised,
  },
  title: { ...typography.bodyStrong, color: semantic.textPrimary, textAlign: 'center' },
  preview: { ...typography.title, color: semantic.primary, textAlign: 'center', marginVertical: spacing.sm },
  groupLabel: { ...typography.captionStrong, color: semantic.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  hourScroll: { maxHeight: 160 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
