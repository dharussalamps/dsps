import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Screen, ScreenHeader, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addAcademicYear, addTerm, updateSchoolSettings, updateWorkingWeekdays } from './api';
import { useAcademicYears, useCurrentYearTerms, useSchoolSettings, useWorkingWeekdays } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const WEEKDAY_LABELS: { iso: number; label: string }[] = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
];

export function AcademicCalendarScreen() {
  const navigation = useNavigation<Nav>();
  const terms = useCurrentYearTerms();
  const years = useAcademicYears();
  const settings = useSchoolSettings();
  const weekdays = useWorkingWeekdays();
  const queryClient = useQueryClient();

  const [editingSettings, setEditingSettings] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [saving, setSaving] = useState(false);

  const [jumpDate, setJumpDate] = useState('');

  const [addingYear, setAddingYear] = useState(false);
  const [yearLabel, setYearLabel] = useState('');
  const [yearStart, setYearStart] = useState('');
  const [yearEnd, setYearEnd] = useState('');

  const [addingTerm, setAddingTerm] = useState(false);
  const [termName, setTermName] = useState('');
  const [termSequence, setTermSequence] = useState('');
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');

  const currentYear = years.data?.find((y) => y.isCurrent) ?? years.data?.[0];

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

  async function saveYear() {
    if (!yearLabel.trim() || !yearStart.trim() || !yearEnd.trim()) return;
    setSaving(true);
    try {
      await addAcademicYear({ label: yearLabel.trim(), startsOn: yearStart.trim(), endsOn: yearEnd.trim(), makeCurrent: true });
      setAddingYear(false);
      setYearLabel('');
      setYearStart('');
      setYearEnd('');
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
    } catch {
      Alert.alert('Could not create the academic year', 'Check the dates and that you have permission to edit the calendar.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTerm() {
    if (!currentYear || !termName.trim() || !termSequence.trim() || !termStart.trim() || !termEnd.trim()) return;
    setSaving(true);
    try {
      await addTerm({
        academicYearId: currentYear.id,
        name: termName.trim(),
        sequence: Number(termSequence),
        startsOn: termStart.trim(),
        endsOn: termEnd.trim(),
      });
      setAddingTerm(false);
      setTermName('');
      setTermSequence('');
      setTermStart('');
      setTermEnd('');
      await queryClient.invalidateQueries({ queryKey: ['calendar', 'terms'] });
    } catch {
      Alert.alert('Could not create the term', 'Terms within a year may not overlap — check the dates.');
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

  return (
    <Screen>
      <ScreenHeader title="Academic calendar" subtitle={currentYear ? `Year ${currentYear.label}` : settings.data?.schoolName} />

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>TERMS</Text>
          {!addingTerm ? <Button label="+ Add term" size="sm" variant="ghost" onPress={() => setAddingTerm(true)} /> : null}
        </View>
        {(terms.data ?? []).map((t) => (
          <View key={t.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{t.name}</Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {t.startsOn} → {t.endsOn}
            </Text>
          </View>
        ))}
        {addingTerm ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <TextField label="Name (e.g. Term 1)" value={termName} onChangeText={setTermName} />
            <TextField label="Sequence (1, 2, 3...)" value={termSequence} onChangeText={setTermSequence} keyboardType="numeric" />
            <TextField label="Starts on" placeholder="YYYY-MM-DD" value={termStart} onChangeText={setTermStart} />
            <TextField label="Ends on" placeholder="YYYY-MM-DD" value={termEnd} onChangeText={setTermEnd} />
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Button label="Save" size="sm" onPress={() => void saveTerm()} loading={saving} />
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => setAddingTerm(false)} />
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>ACADEMIC YEARS</Text>
          {!addingYear ? <Button label="+ New year" size="sm" variant="ghost" onPress={() => setAddingYear(true)} /> : null}
        </View>
        {(years.data ?? []).map((y) => (
          <View key={y.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>
              {y.label} {y.isCurrent ? '· current' : ''}
            </Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
              {y.startsOn} → {y.endsOn}
            </Text>
          </View>
        ))}
        {addingYear ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <TextField label="Label (e.g. 2027)" value={yearLabel} onChangeText={setYearLabel} />
            <TextField label="Starts on" placeholder="YYYY-MM-DD" value={yearStart} onChangeText={setYearStart} />
            <TextField label="Ends on" placeholder="YYYY-MM-DD" value={yearEnd} onChangeText={setYearEnd} />
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>This becomes the new current year.</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs }}>
              <Button label="Save" size="sm" onPress={() => void saveYear()} loading={saving} />
              <Button label="Cancel" size="sm" variant="ghost" onPress={() => setAddingYear(false)} />
            </View>
          </View>
        ) : null}
      </Card>

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>WORKING DAYS</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
          {WEEKDAY_LABELS.map((w) => {
            const active = (weekdays.data ?? []).includes(w.iso);
            return (
              <Button
                key={w.iso}
                label={w.label}
                size="sm"
                variant={active ? 'primary' : 'outline'}
                onPress={() => void toggleWeekday(w.iso)}
              />
            );
          })}
        </View>
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

      <Button label="Classes, subjects & terms" variant="outline" onPress={() => navigation.navigate('AcademicStructure')} />
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
