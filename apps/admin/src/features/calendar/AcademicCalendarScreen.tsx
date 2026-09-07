import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Screen, ScreenHeader, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { updateSchoolSettings } from './api';
import { useCurrentYearTerms, useSchoolSettings } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function AcademicCalendarScreen() {
  const navigation = useNavigation<Nav>();
  const terms = useCurrentYearTerms();
  const settings = useSchoolSettings();
  const queryClient = useQueryClient();

  const [editingSettings, setEditingSettings] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [saving, setSaving] = useState(false);

  const [jumpDate, setJumpDate] = useState('');

  function startEdit() {
    if (settings.data) {
      setDueAt(settings.data.attendanceDueAt);
      setEditMinutes(String(settings.data.attendanceEditMinutes));
    }
    setEditingSettings(true);
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await updateSchoolSettings({ attendance_due_at: dueAt, attendance_edit_minutes: Number(editMinutes) || undefined });
      setEditingSettings(false);
      await queryClient.invalidateQueries({ queryKey: ['calendar', 'settings'] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader title="Academic calendar" subtitle={settings.data?.schoolName} />

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>TERMS</Text>
        {(terms.data ?? []).map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{t.name}</Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {t.startsOn} → {t.endsOn}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>RULES</Text>
          {!editingSettings ? <Button label="Edit" size="sm" variant="ghost" onPress={startEdit} /> : null}
        </View>
        {editingSettings ? (
          <View style={{ gap: spacing.sm }}>
            <TextField label="Attendance due at (HH:MM)" value={dueAt} onChangeText={setDueAt} />
            <TextField label="Edit window (minutes)" value={editMinutes} onChangeText={setEditMinutes} keyboardType="numeric" />
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Button label="Save" size="sm" onPress={() => void saveSettings()} loading={saving} />
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => setEditingSettings(false)} />
            </View>
          </View>
        ) : settings.data ? (
          <>
            <Row label="Attendance due at" value={settings.data.attendanceDueAt} />
            <Row label="Edit window" value={`${settings.data.attendanceEditMinutes} min`} />
            <Row label="Risk: consecutive absences" value={String(settings.data.riskConsecutiveDays)} />
            <Row label="Risk: attendance %" value={`${settings.data.riskAttendancePct}%`} />
          </>
        ) : null}
      </Card>

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>EDIT A DAY</Text>
        <TextField label="Date" placeholder="YYYY-MM-DD" value={jumpDate} onChangeText={setJumpDate} />
        <Button label="Open" disabled={!jumpDate.trim()} onPress={() => navigation.navigate('CalendarDayEditor', { date: jumpDate.trim() })} />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}
