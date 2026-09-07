import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, TextField } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { spacing, typography, semantic } from '@/theme/tokens';
import { assignResponsibility, fetchCurrentAcademicYearId } from './api';
import { useResponsibilitiesForStaff } from './hooks';

/** section 10 StaffProfile action: "Assign responsibility". */
export function ResponsibilitiesSection({ staffId }: { staffId: string }) {
  const me = useAuthStore((s) => s.staff);
  const queryClient = useQueryClient();
  const responsibilities = useResponsibilitiesForStaff(staffId);

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [saving, setSaving] = useState(false);

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
      await queryClient.invalidateQueries({ queryKey: ['staff', 'responsibilities', staffId] });
      await queryClient.invalidateQueries({ queryKey: ['staff', 'duty-roster'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>RESPONSIBILITIES</Text>
        {!adding ? <Button label="Assign" size="sm" variant="ghost" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <View style={{ gap: spacing.sm }}>
          <TextField label="Title (e.g. Library duty)" value={title} onChangeText={setTitle} />
          <TextField label="Schedule note (optional)" value={scheduleNote} onChangeText={setScheduleNote} />
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Button label="Save" size="sm" onPress={() => void submit()} loading={saving} />
            <Button label="Cancel" size="sm" variant="ghost" onPress={() => setAdding(false)} />
          </View>
        </View>
      ) : null}

      {responsibilities.data?.map((r) => (
        <View key={r.id} style={{ paddingVertical: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{r.title}</Text>
          {r.scheduleNote ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{r.scheduleNote}</Text> : null}
        </View>
      ))}
    </Card>
  );
}
