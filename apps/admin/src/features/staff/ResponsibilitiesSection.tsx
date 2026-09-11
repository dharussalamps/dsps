import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Icon, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { assignResponsibility, fetchCurrentAcademicYearId, removeResponsibility } from './api';
import { useResponsibilitiesForStaff, useResponsibilityTitleSuggestions } from './hooks';

/** section 10 StaffProfile action: "Assign responsibility". */
export function ResponsibilitiesSection({ staffId, onDirtyChange }: { staffId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const me = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const responsibilities = useResponsibilitiesForStaff(staffId);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const titleSuggestions = useResponsibilityTitleSuggestions(title);
  const suggestions = (titleSuggestions.data ?? []).filter((t) => t !== title);

  const dirty = adding && (!!title.trim() || !!scheduleNote.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['staff', 'responsibilities', staffId] });
    await queryClient.invalidateQueries({ queryKey: ['staff', 'duty-roster'] });
  }

  async function submit() {
    if (!me || !title.trim()) return;
    setSaving(true);
    try {
      const yearId = await fetchCurrentAcademicYearId();
      if (!yearId) return;
      await assignResponsibility({ staffId, title: title.trim(), scheduleNote: scheduleNote.trim(), academicYearId: yearId, assignedBy: me.id });
      setAdding(false);
      setTitle('');
      setScheduleNote('');
      setSuggestionsOpen(false);
      await invalidate();
    } finally {
      setSaving(false);
    }
  }

  async function doRemove(id: string) {
    setRemovingId(id);
    try {
      await removeResponsibility(id);
      await invalidate();
    } catch (err) {
      Alert.alert('Could not remove this responsibility', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(id: string, title: string) {
    Alert.alert('Remove this responsibility?', `"${title}" will be unassigned.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void doRemove(id) },
    ]);
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>RESPONSIBILITIES</Text>
        {!adding ? <Button label="Assign" size="sm" variant="ghost" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <View style={{ gap: spacing.sm }}>
          <View>
            <TextField
              label="Title (e.g. Library duty)"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setSuggestionsOpen(true);
              }}
            />
            {suggestionsOpen && suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {suggestions.map((s, i) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    style={[styles.suggestionRow, i > 0 && styles.suggestionRowDivider]}
                    onPress={() => {
                      setTitle(s);
                      setSuggestionsOpen(false);
                    }}
                  >
                    <Text style={{ ...typography.body, color: semantic.textPrimary }} numberOfLines={1}>
                      {s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <TextField label="Schedule note (optional)" value={scheduleNote} onChangeText={setScheduleNote} />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Save" size="sm" onPress={() => void submit()} loading={saving} />
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              onPress={() => {
                setAdding(false);
                setTitle('');
                setScheduleNote('');
                setSuggestionsOpen(false);
              }}
            />
          </View>
        </View>
      ) : null}

      {responsibilities.data?.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={styles.rowIconChip}>
            <Icon name="ribbon" size={15} color={semantic.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{r.title}</Text>
            {r.scheduleNote ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{r.scheduleNote}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${r.title}`}
            hitSlop={8}
            disabled={removingId === r.id}
            onPress={() => confirmRemove(r.id, r.title)}
            style={styles.removeBtn}
          >
            {removingId === r.id ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={15} color={colors.error} />}
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: semantic.surfaceAlt,
  },
  rowIconChip: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestions: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radius.md,
    backgroundColor: semantic.surface,
    marginTop: -spacing.xs,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestionRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
});
