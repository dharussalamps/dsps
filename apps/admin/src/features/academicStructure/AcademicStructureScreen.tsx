import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, EmptyState, Hero, HeroDoodle, Screen, ScreenHeader, TextField } from '@/components';
import { useAcademicYears } from '@/features/calendar/hooks';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { spacing, typography, semantic } from '@/theme/tokens';
import { addClass, addGrade, addSubject, assignClassSubjectTeacher, removeClassSubjectTeacher } from './api';
import { useClassSubjectTeachers, useClassesForCurrentYear, useGrades, useSubjects } from './hooks';

/**
 * Screen #42 (section 6.1): "Classes, subjects and terms" — terms
 * themselves are edited from AcademicCalendarScreen (they're the calendar's
 * own concern); this covers the rest of FR-ADM-03, which previously had no
 * admin surface at all: grades, subjects (with which grades teach them),
 * classes (with their class teacher), and which teacher teaches which
 * subject to which class (class_subject_teachers — FR-MRK-01).
 */
export function AcademicStructureScreen() {
  const navigation = useNavigation();
  const grades = useGrades();
  const subjects = useSubjects();
  const classes = useClassesForCurrentYear();
  const assignments = useClassSubjectTeachers();
  const years = useAcademicYears();
  const queryClient = useQueryClient();
  const currentYear = years.data?.find((y) => y.isCurrent) ?? years.data?.[0];

  const [gradesDirty, setGradesDirty] = useState(false);
  const [subjectsDirty, setSubjectsDirty] = useState(false);
  const [classesDirty, setClassesDirty] = useState(false);
  const [assignmentsDirty, setAssignmentsDirty] = useState(false);
  useConfirmDiscardOnLeave(gradesDirty || subjectsDirty || classesDirty || assignmentsDirty);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="layers-outline" bottomIcon="school-outline" />
        <ScreenHeader title="Classes, subjects & terms" subtitle="Grades, classes, subjects and who teaches what" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.lg }}>

      <GradesSection
        grades={grades.data ?? []}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['academicStructure', 'grades'] })}
        onDirtyChange={setGradesDirty}
      />

      <SubjectsSection
        subjects={subjects.data ?? []}
        grades={grades.data ?? []}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['academicStructure', 'subjects'] })}
        onDirtyChange={setSubjectsDirty}
      />

      <ClassesSection
        classes={classes.data ?? []}
        grades={grades.data ?? []}
        currentYearId={currentYear?.id}
        onChanged={() => {
          queryClient.invalidateQueries({ queryKey: ['academicStructure', 'classes'] });
          queryClient.invalidateQueries({ queryKey: ['classes', 'current-year'] });
        }}
        onDirtyChange={setClassesDirty}
      />

      <AssignmentsSection
        assignments={assignments.data ?? []}
        classes={classes.data ?? []}
        subjects={subjects.data ?? []}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['academicStructure', 'class-subject-teachers'] })}
        onDirtyChange={setAssignmentsDirty}
      />
      </View>
    </Screen>
  );
}

function GradesSection({
  grades,
  onChanged,
  onDirtyChange,
}: {
  grades: { id: string; number: number; name: string }[];
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const dirty = adding && (!!number.trim() || !!name.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function save() {
    if (!number.trim() || !name.trim()) return;
    setBusy(true);
    try {
      await addGrade(Number(number), name.trim());
      setAdding(false);
      setNumber('');
      setName('');
      onChanged();
    } catch {
      Alert.alert('Could not add grade', 'That grade number may already exist.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="GRADES" onAdd={() => setAdding(true)} showAdd={!adding} />
      {grades.length === 0 ? <EmptyState title="No grades yet" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {grades.map((g) => (
          <View key={g.id} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: semantic.surfaceAlt, borderRadius: 999 }}>
            <Text style={{ ...typography.captionStrong, color: semantic.textPrimary }}>{g.name}</Text>
          </View>
        ))}
      </View>
      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Number" value={number} onChangeText={setNumber} keyboardType="numeric" />
          <TextField label="Name (e.g. Grade 6)" value={name} onChangeText={setName} />
          <FormActions onSave={() => void save()} onCancel={() => setAdding(false)} busy={busy} />
        </View>
      ) : null}
    </Card>
  );
}

function SubjectsSection({
  subjects,
  grades,
  onChanged,
  onDirtyChange,
}: {
  subjects: { id: string; name: string; code: string | null; gradeIds: string[] }[];
  grades: { id: string; number: number; name: string }[];
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const dirty = adding && (!!name.trim() || !!code.trim() || selectedGrades.length > 0);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addSubject(name.trim(), code.trim() || undefined, selectedGrades);
      setAdding(false);
      setName('');
      setCode('');
      setSelectedGrades([]);
      onChanged();
    } catch {
      Alert.alert('Could not add subject', 'That subject code may already exist.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="SUBJECTS" onAdd={() => setAdding(true)} showAdd={!adding} />
      {subjects.length === 0 ? <EmptyState title="No subjects yet" /> : null}
      {subjects.map((s) => (
        <View key={s.id} style={{ paddingVertical: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{s.name}</Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            {grades.filter((g) => s.gradeIds.includes(g.id)).map((g) => g.name).join(', ') || 'No grades assigned'}
          </Text>
        </View>
      ))}
      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <TextField label="Name" value={name} onChangeText={setName} />
          <TextField label="Code (optional)" value={code} onChangeText={setCode} />
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>TAUGHT IN</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {grades.map((g) => (
              <Button
                key={g.id}
                label={g.name}
                size="sm"
                variant={selectedGrades.includes(g.id) ? 'primary' : 'outline'}
                onPress={() => setSelectedGrades((prev) => (prev.includes(g.id) ? prev.filter((id) => id !== g.id) : [...prev, g.id]))}
              />
            ))}
          </View>
          <FormActions onSave={() => void save()} onCancel={() => setAdding(false)} busy={busy} />
        </View>
      ) : null}
    </Card>
  );
}

function ClassesSection({
  classes,
  grades,
  currentYearId,
  onChanged,
  onDirtyChange,
}: {
  classes: { id: string; name: string; gradeId: string; gradeNumber: number; classTeacherId: string | null; classTeacherName: string | null }[];
  grades: { id: string; number: number; name: string }[];
  currentYearId: string | undefined;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState<StaffSummary | null>(null);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teacherResults, setTeacherResults] = useState<StaffSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const dirty = adding && (!!gradeId || !!name.trim() || !!teacher || !!teacherQuery.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function searchTeachers(q: string) {
    setTeacherQuery(q);
    setTeacherResults(await listStaff(q));
  }

  async function save() {
    if (!gradeId || !name.trim() || !currentYearId) return;
    setBusy(true);
    try {
      await addClass({ gradeId, name: name.trim(), academicYearId: currentYearId, classTeacherId: teacher?.id ?? null });
      setAdding(false);
      setGradeId(null);
      setName('');
      setTeacher(null);
      setTeacherQuery('');
      setTeacherResults([]);
      onChanged();
    } catch {
      Alert.alert('Could not add class', 'That class name may already exist for this year.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="CLASSES" onAdd={() => setAdding(true)} showAdd={!adding} />
      {classes.length === 0 ? <EmptyState title="No classes yet" /> : null}
      {classes.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{c.name}</Text>
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{c.classTeacherName ?? 'No class teacher'}</Text>
        </View>
      ))}
      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {!currentYearId ? (
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>Create an academic year first.</Text>
          ) : null}
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>GRADE</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {grades.map((g) => (
              <Button key={g.id} label={g.name} size="sm" variant={gradeId === g.id ? 'primary' : 'outline'} onPress={() => setGradeId(g.id)} />
            ))}
          </View>
          <TextField label="Class name (e.g. 4B)" value={name} onChangeText={setName} />
          <TextField label="Class teacher (search)" value={teacherQuery} onChangeText={(v) => void searchTeachers(v)} />
          {teacherQuery && !teacher ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {teacherResults.map((t) => (
                <Button key={t.id} label={t.fullName} size="sm" variant="outline" onPress={() => { setTeacher(t); setTeacherQuery(t.fullName); }} />
              ))}
            </View>
          ) : null}
          <FormActions onSave={() => void save()} onCancel={() => setAdding(false)} busy={busy} disabled={!gradeId || !name.trim() || !currentYearId} />
        </View>
      ) : null}
    </Card>
  );
}

function AssignmentsSection({
  assignments,
  classes,
  subjects,
  onChanged,
  onDirtyChange,
}: {
  assignments: { id: string; classId: string; className: string; subjectId: string; subjectName: string; staffId: string; staffName: string }[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<StaffSummary | null>(null);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teacherResults, setTeacherResults] = useState<StaffSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const dirty = adding && (!!classId || !!subjectId || !!teacher || !!teacherQuery.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  async function searchTeachers(q: string) {
    setTeacherQuery(q);
    setTeacherResults(await listStaff(q));
  }

  async function save() {
    if (!classId || !subjectId || !teacher) return;
    setBusy(true);
    try {
      await assignClassSubjectTeacher(classId, subjectId, teacher.id);
      setAdding(false);
      setClassId(null);
      setSubjectId(null);
      setTeacher(null);
      setTeacherQuery('');
      onChanged();
    } catch {
      Alert.alert('Could not save this assignment');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await removeClassSubjectTeacher(id);
    onChanged();
  }

  return (
    <Card>
      <SectionHeader title="WHO TEACHES WHAT" onAdd={() => setAdding(true)} showAdd={!adding} />
      <Text style={{ ...typography.caption, color: semantic.textSecondary, marginBottom: spacing.xs }}>
        FR-MRK-01: each class-subject pairing has one assigned teacher — this is what scopes their mark entry.
      </Text>
      {assignments.length === 0 ? <EmptyState title="No assignments yet" /> : null}
      {assignments.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs }}>
          <View>
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>
              {a.className} · {a.subjectName}
            </Text>
            <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{a.staffName}</Text>
          </View>
          <Button label="Remove" size="sm" variant="ghost" onPress={() => void remove(a.id)} />
        </View>
      ))}
      {adding ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>CLASS</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {classes.map((c) => (
              <Button key={c.id} label={c.name} size="sm" variant={classId === c.id ? 'primary' : 'outline'} onPress={() => setClassId(c.id)} />
            ))}
          </View>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>SUBJECT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {subjects.map((s) => (
              <Button key={s.id} label={s.name} size="sm" variant={subjectId === s.id ? 'primary' : 'outline'} onPress={() => setSubjectId(s.id)} />
            ))}
          </View>
          <TextField label="Teacher (search)" value={teacherQuery} onChangeText={(v) => void searchTeachers(v)} />
          {teacherQuery && !teacher ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {teacherResults.map((t) => (
                <Button key={t.id} label={t.fullName} size="sm" variant="outline" onPress={() => { setTeacher(t); setTeacherQuery(t.fullName); }} />
              ))}
            </View>
          ) : null}
          <FormActions onSave={() => void save()} onCancel={() => setAdding(false)} busy={busy} disabled={!classId || !subjectId || !teacher} />
        </View>
      ) : null}
    </Card>
  );
}

function SectionHeader({ title, onAdd, showAdd }: { title: string; onAdd: () => void; showAdd: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>{title}</Text>
      {showAdd ? <Button label="+ Add" size="sm" variant="ghost" onPress={onAdd} /> : null}
    </View>
  );
}

function FormActions({ onSave, onCancel, busy, disabled }: { onSave: () => void; onCancel: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      <Button label="Save" size="sm" onPress={onSave} loading={busy} disabled={disabled} />
      <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
    </View>
  );
}
