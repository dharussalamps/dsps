import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, CalendarModal, Card, Hero, Icon, Screen, ScreenHeader, SectionHeader, SegmentedControl, StatusPill, TextField } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { formatDMYInput, parseDMY, toDMY } from '@/lib/date';
import { createStudent } from './api';
import { AddGuardianSection } from './AddGuardianSection';
import { GuardianCallButton } from './GuardianCallButton';
import { useClasses, useStudentGuardians } from './hooks';
import { ImportStudentsSection } from './ImportStudentsSection';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Mode = 'single' | 'import';

/** Two-step flow: create the student record first, then link guardian(s) against the new studentId — a guardian link always needs an existing student to attach to. Done stays disabled until at least one guardian is linked. */
export function AddStudentScreen() {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const classes = useClasses();

  const [mode, setMode] = useState<Mode>('single');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState('');

  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [admissionNo, setAdmissionNo] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);

  const guardians = useStudentGuardians(createdId ?? undefined);

  async function submit() {
    if (!fullName.trim() || !admissionNo.trim() || !dateOfBirth.trim() || !gender) return;
    const isoDateOfBirth = parseDMY(dateOfBirth);
    if (!isoDateOfBirth) {
      setError('Enter date of birth as DD/MM/YYYY.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const className = classes.data?.find((c) => c.id === classId)?.name;
      const id = await createStudent({
        fullName: fullName.trim(),
        preferredName: preferredName.trim() || undefined,
        admissionNo: admissionNo.trim(),
        dateOfBirth: isoDateOfBirth,
        gender,
        className,
      });
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      setCreatedName(preferredName.trim() || fullName.trim());
      setCreatedId(id);
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? '';
      setError(message.includes('duplicate key') ? 'That admission number is already in use.' : 'Could not create this student. You may not have permission to do this.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Add student" tone="onPrimary" back={navigation.canGoBack()} hideBell />
        {!createdId ? (
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { key: 'single', label: 'Add one', icon: 'person-add-outline' },
              { key: 'import', label: 'Import CSV', icon: 'cloud-upload-outline' },
            ]}
          />
        ) : null}
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {mode === 'import' && !createdId ? (
          <ImportStudentsSection />
        ) : !createdId ? (
          <Card>
            <SectionHeader icon="person-add-outline" label="STUDENT DETAILS" />
            <View style={{ gap: spacing.md }}>
              <TextField label="Full name" value={fullName} onChangeText={setFullName} autoFocus />
              <TextField label="Preferred name (optional)" value={preferredName} onChangeText={setPreferredName} />
              <TextField label="Admission number" value={admissionNo} onChangeText={setAdmissionNo} autoCapitalize="none" />
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
                <TextField
                  label="Date of birth"
                  value={dateOfBirth}
                  onChangeText={(t) => setDateOfBirth(formatDMYInput(t))}
                  placeholder="DD/MM/YYYY"
                  keyboardType="number-pad"
                  maxLength={10}
                  style={{ flex: 1 }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose date of birth from calendar"
                  onPress={() => setShowCalendar(true)}
                  style={({ pressed }) => [styles.calendarButton, pressed && styles.calendarButtonPressed]}
                >
                  <Icon name="calendar-outline" size={20} color={semantic.primary} />
                </Pressable>
              </View>
              <CalendarModal
                visible={showCalendar}
                onClose={() => setShowCalendar(false)}
                value={parseDMY(dateOfBirth) ?? undefined}
                maxDate={new Date().toISOString().slice(0, 10)}
                onChange={(iso) => setDateOfBirth(toDMY(iso))}
                mode="yearFirst"
              />

              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Gender</Text>
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Button label="Male" size="sm" variant={gender === 'male' ? 'primary' : 'outline'} onPress={() => setGender('male')} />
                  <Button label="Female" size="sm" variant={gender === 'female' ? 'primary' : 'outline'} onPress={() => setGender('female')} />
                </View>
              </View>

              <View style={{ gap: spacing.xs }}>
                <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>Class (optional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {(classes.data ?? []).map((c) => (
                    <Button
                      key={c.id}
                      label={c.name}
                      size="sm"
                      variant={classId === c.id ? 'primary' : 'outline'}
                      onPress={() => setClassId((v) => (v === c.id ? null : c.id))}
                    />
                  ))}
                </View>
              </View>

              {error ? <Text style={{ ...typography.caption, color: colors.error }}>{error}</Text> : null}
              <Button
                label="Create student"
                onPress={() => void submit()}
                loading={saving}
                disabled={!fullName.trim() || !admissionNo.trim() || !dateOfBirth.trim() || !gender}
              />
            </View>
          </Card>
        ) : (
          <>
            <Card style={{ backgroundColor: semantic.primary, borderWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Icon name="checkmark-circle" size={28} color={colors.white} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ ...typography.bodyStrong, color: colors.white }}>{createdName} was added</Text>
                  <Text style={{ ...typography.caption, color: colors.cream100 }}>Link or create a guardian to finish adding this student.</Text>
                </View>
              </View>
            </Card>

            <Card>
              <SectionHeader icon="people-outline" label="GUARDIANS" />
              {guardians.data && guardians.data.length === 0 ? (
                <Text style={{ ...typography.caption, color: semantic.textSecondary, paddingVertical: spacing.xs }}>No guardians linked yet.</Text>
              ) : null}
              {(guardians.data ?? []).map((g, i) => (
                <View key={g.guardianId} style={{ paddingVertical: spacing.sm, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: semantic.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{g.fullName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
                        {g.relationship ? <StatusPill label={g.relationship} tone="info" /> : null}
                        {g.isPrimary ? <StatusPill label="Primary" tone="gold" /> : null}
                      </View>
                    </View>
                    <GuardianCallButton studentId={createdId} guardianId={g.guardianId} phone={g.phonePrimary} />
                  </View>
                </View>
              ))}
              <View style={{ paddingTop: spacing.sm, borderTopWidth: (guardians.data?.length ?? 0) > 0 ? 1 : 0, borderTopColor: semantic.border, marginTop: (guardians.data?.length ?? 0) > 0 ? spacing.xs : 0 }}>
                <AddGuardianSection
                  studentId={createdId}
                  onLinked={() => void queryClient.invalidateQueries({ queryKey: ['students', 'guardians', createdId] })}
                />
              </View>
            </Card>

            <Button
              label="Done"
              variant="outline"
              disabled={!guardians.data || guardians.data.length === 0}
              onPress={() => navigation.replace('StudentProfile', { studentId: createdId })}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  calendarButton: {
    width: minTapTarget,
    height: minTapTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarButtonPressed: { backgroundColor: semantic.primaryMuted },
});
