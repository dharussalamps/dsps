import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, TextField } from '@/components';
import { useAcademicYears } from '@/features/calendar/hooks';
import { listStaff, type StaffSummary } from '@/features/staff/api';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import { colors, radius, spacing, typography, semantic } from '@/theme/tokens';
import {
  addClass,
  addGrade,
  addSubject,
  assignClassSubjectTeacher,
  canDeleteClass,
  canDeleteGrade,
  canDeleteSubject,
  deleteClass,
  deleteGrade,
  deleteSubject,
  removeClassSubjectTeacher,
  updateClass,
  updateGrade,
  updateSubject,
} from './api';
import { useClassSubjectTeachers, useClassesForCurrentYear, useGrades, useSubjects } from './hooks';

/** A foreign key violation (Postgres 23503) means the row is still referenced elsewhere in the schema — the DB itself enforces "only deletable when unlinked". */
function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23503';
}

/** Case-insensitive name clash against the already-loaded (i.e. current database) list — checked before every save so a duplicate never reaches the DB round trip at all. excludeId lets an edit ignore the row being edited. */
function findDuplicateName<T extends { id: string; name: string }>(items: T[], name: string, excludeId: string | null): boolean {
  const trimmed = name.trim().toLowerCase();
  return items.some((item) => item.id !== excludeId && item.name.trim().toLowerCase() === trimmed);
}

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
        <ScreenHeader title="Academic Structure" subtitle="Grades, classes, subjects and who teaches what" tone="onPrimary" back={navigation.canGoBack()} hideBell />
      </Hero>
      <View style={{ padding: spacing.lg, gap: spacing.xl }}>
        <Card style={styles.statsCard}>
          <StatBlock value={grades.data?.length ?? 0} label="Grades" />
          <View style={styles.statDivider} />
          <StatBlock value={classes.data?.length ?? 0} label="Classes" />
          <View style={styles.statDivider} />
          <StatBlock value={subjects.data?.length ?? 0} label="Subjects" />
        </Card>

        <GradesSection
          grades={grades.data ?? []}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['academicStructure', 'grades'] })}
          onDirtyChange={setGradesDirty}
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

        <SubjectsSection
          subjects={subjects.data ?? []}
          grades={grades.data ?? []}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['academicStructure', 'subjects'] })}
          onDirtyChange={setSubjectsDirty}
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

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const dirty = formOpen && !!name.trim();
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  // The Delete icon only appears once we've confirmed nothing else references this grade — default stays hidden while that check is in flight or if it fails.
  useEffect(() => {
    if (!editingId) {
      setCanDelete(false);
      return;
    }
    let cancelled = false;
    setCanDelete(false);
    canDeleteGrade(editingId)
      .then((ok) => { if (!cancelled) setCanDelete(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  function openAdd() {
    setEditingId(null);
    // Grade numbers are just a display order the app owns — the next free slot after the highest existing one, not something the user picks.
    const nextNumber = grades.length > 0 ? Math.max(...grades.map((g) => g.number)) + 1 : 1;
    setNumber(String(nextNumber));
    setName('');
    setFormOpen(true);
  }

  function openEdit(g: { id: string; number: number; name: string }) {
    setEditingId(g.id);
    setNumber(String(g.number));
    setName(g.name);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setNumber('');
    setName('');
  }

  async function save() {
    if (!number.trim() || !name.trim()) return;
    if (findDuplicateName(grades, name, editingId)) {
      Alert.alert('Duplicate grade', 'A grade with this name already exists.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) await updateGrade(editingId, Number(number), name.trim());
      else await addGrade(Number(number), name.trim());
      closeForm();
      onChanged();
    } catch {
      Alert.alert(editingId ? 'Could not update grade' : 'Could not add grade', 'That grade number may already exist.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this grade?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteGrade(editingId);
      closeForm();
      onChanged();
    } catch (err) {
      Alert.alert(
        'Could not delete this grade',
        isForeignKeyViolation(err) ? 'This grade is still used by classes or subjects — remove those first.' : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <SectionHeader
        icon="layers-outline"
        label="GRADES"
        accessory={!formOpen ? <Button label="Add" size="sm" variant="ghost" icon="add-circle-outline" onPress={openAdd} /> : undefined}
      />
      {grades.length === 0 ? <EmptyState title="No grades yet" icon="layers-outline" /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {grades.map((g) => {
          const active = editingId === g.id;
          return (
            <Pressable
              key={g.id}
              onPress={() => openEdit(g)}
              style={[styles.gradePill, { backgroundColor: active ? semantic.primary : semantic.primaryMuted }]}
            >
              <Text style={{ ...typography.captionStrong, color: active ? colors.white : semantic.primary }}>{g.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {formOpen ? (
        <>
          <TextField label="Name (e.g. Grade 6)" value={name} onChangeText={setName} />
          <FormActions
            onSave={() => void save()}
            onCancel={closeForm}
            busy={busy}
            onDelete={editingId && canDelete ? confirmDelete : undefined}
            deleteBusy={deleting}
          />
        </>
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const dirty = formOpen && (!!name.trim() || selectedGrades.length > 0);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  // The Delete icon only appears once we've confirmed nothing else references this subject — default stays hidden while that check is in flight or if it fails.
  useEffect(() => {
    if (!editingId) {
      setCanDelete(false);
      return;
    }
    let cancelled = false;
    setCanDelete(false);
    canDeleteSubject(editingId)
      .then((ok) => { if (!cancelled) setCanDelete(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  function openAdd() {
    setEditingId(null);
    setName('');
    setSelectedGrades([]);
    setFormOpen(true);
  }

  function openEdit(s: { id: string; name: string; gradeIds: string[] }) {
    setEditingId(s.id);
    setName(s.name);
    setSelectedGrades(s.gradeIds);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setName('');
    setSelectedGrades([]);
  }

  async function save() {
    if (!name.trim()) return;
    if (findDuplicateName(subjects, name, editingId)) {
      Alert.alert('Duplicate subject', 'A subject with this name already exists.');
      return;
    }
    setBusy(true);
    try {
      // The code field exists in the schema for reporting/import shorthand, but nobody picks it by hand — it just mirrors the name.
      if (editingId) await updateSubject(editingId, name.trim(), name.trim(), selectedGrades);
      else await addSubject(name.trim(), name.trim(), selectedGrades);
      closeForm();
      onChanged();
    } catch {
      Alert.alert(editingId ? 'Could not update subject' : 'Could not add subject', 'A subject with that name may already exist.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this subject?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteSubject(editingId);
      closeForm();
      onChanged();
    } catch (err) {
      Alert.alert(
        'Could not delete this subject',
        isForeignKeyViolation(err)
          ? 'This subject is still linked to a grade, class, or mark sheet — remove those first.'
          : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        icon="book-outline"
        label="SUBJECTS"
        accessory={!formOpen ? <Button label="Add" size="sm" variant="ghost" icon="add-circle-outline" onPress={openAdd} /> : undefined}
      />
      {subjects.length === 0 ? <EmptyState title="No subjects yet" icon="book-outline" /> : null}
      <View style={{ gap: spacing.sm }}>
        {subjects.map((s) => {
          const active = editingId === s.id;
          const taughtIn = grades.filter((g) => s.gradeIds.includes(g.id)).map((g) => g.name).join(', ') || 'No grades assigned';
          return (
            <Card key={s.id} flat onPress={() => openEdit(s)} style={active ? styles.rowActive : undefined}>
              <View style={styles.row}>
                <View style={styles.iconBadge}>
                  <Icon name="book-outline" size={18} color={semantic.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.name}</Text>
                  <Text style={styles.rowCaption}>{taughtIn}</Text>
                </View>
                <Icon name="chevron-forward" size={18} color={semantic.textSecondary} />
              </View>
            </Card>
          );
        })}
      </View>
      {formOpen ? (
        <Card>
          <TextField label="Name" value={name} onChangeText={setName} />
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
          <FormActions
            onSave={() => void save()}
            onCancel={closeForm}
            busy={busy}
            onDelete={editingId && canDelete ? confirmDelete : undefined}
            deleteBusy={deleting}
          />
        </Card>
      ) : null}
    </View>
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gradeId, setGradeId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [teacher, setTeacher] = useState<{ id: string; fullName: string } | null>(null);
  const [teacherQuery, setTeacherQuery] = useState('');
  const [teacherResults, setTeacherResults] = useState<StaffSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);

  const dirty = formOpen && (!!gradeId || !!name.trim() || !!teacher || !!teacherQuery.trim());
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-notify when dirtiness itself changes; cleanup resets on unmount too.
  }, [dirty]);

  // The Delete icon only appears once we've confirmed nothing else references this class — default stays hidden while that check is in flight or if it fails.
  useEffect(() => {
    if (!editingId) {
      setCanDelete(false);
      return;
    }
    let cancelled = false;
    setCanDelete(false);
    canDeleteClass(editingId)
      .then((ok) => { if (!cancelled) setCanDelete(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [editingId]);

  async function searchTeachers(q: string) {
    setTeacherQuery(q);
    setTeacher(null);
    setTeacherResults(await listStaff(q));
  }

  function openAdd() {
    setEditingId(null);
    setGradeId(null);
    setName('');
    setTeacher(null);
    setTeacherQuery('');
    setTeacherResults([]);
    setFormOpen(true);
  }

  function openEdit(c: { id: string; name: string; gradeId: string; classTeacherId: string | null; classTeacherName: string | null }) {
    setEditingId(c.id);
    setGradeId(c.gradeId);
    setName(c.name);
    setTeacher(c.classTeacherId ? { id: c.classTeacherId, fullName: c.classTeacherName ?? '' } : null);
    setTeacherQuery(c.classTeacherName ?? '');
    setTeacherResults([]);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setGradeId(null);
    setName('');
    setTeacher(null);
    setTeacherQuery('');
    setTeacherResults([]);
  }

  async function save() {
    if (!gradeId || !name.trim() || !currentYearId) return;
    if (findDuplicateName(classes, name, editingId)) {
      Alert.alert('Duplicate class', 'A class with this name already exists for this academic year.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updateClass(editingId, { gradeId, name: name.trim(), classTeacherId: teacher?.id ?? null });
      } else {
        await addClass({ gradeId, name: name.trim(), academicYearId: currentYearId, classTeacherId: teacher?.id ?? null });
      }
      closeForm();
      onChanged();
    } catch {
      Alert.alert(editingId ? 'Could not update class' : 'Could not add class', 'That class name may already exist for this year.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this class?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  async function doDelete() {
    if (!editingId) return;
    setDeleting(true);
    try {
      await deleteClass(editingId);
      closeForm();
      onChanged();
    } catch (err) {
      Alert.alert(
        'Could not delete this class',
        isForeignKeyViolation(err)
          ? 'This class still has students, attendance, or marks linked to it — remove those first.'
          : 'Something went wrong — try again.',
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        icon="school-outline"
        label="CLASSES"
        accessory={!formOpen ? <Button label="Add" size="sm" variant="ghost" icon="add-circle-outline" onPress={openAdd} /> : undefined}
      />
      {classes.length === 0 ? <EmptyState title="No classes yet" icon="school-outline" /> : null}
      <View style={{ gap: spacing.sm }}>
        {classes.map((c) => {
          const active = editingId === c.id;
          return (
            <Card key={c.id} flat onPress={() => openEdit(c)} style={active ? styles.rowActive : undefined}>
              <View style={styles.row}>
                <Avatar name={c.classTeacherName ?? c.name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{c.name}</Text>
                  <Text style={styles.rowCaption}>
                    Grade {c.gradeNumber} · {c.classTeacherName ?? 'No class teacher'}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} color={semantic.textSecondary} />
              </View>
            </Card>
          );
        })}
      </View>
      {formOpen ? (
        <Card>
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
          <FormActions
            onSave={() => void save()}
            onCancel={closeForm}
            busy={busy}
            disabled={!gradeId || !name.trim() || !currentYearId}
            onDelete={editingId && canDelete ? confirmDelete : undefined}
            deleteBusy={deleting}
          />
        </Card>
      ) : null}
    </View>
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
    <View style={{ gap: spacing.sm }}>
      <SectionHeader
        icon="person-outline"
        label="WHO TEACHES WHAT"
        accessory={!adding ? <Button label="Add" size="sm" variant="ghost" icon="add-circle-outline" onPress={() => setAdding(true)} /> : undefined}
      />
      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
        FR-MRK-01: each class-subject pairing has one assigned teacher — this is what scopes their mark entry.
      </Text>
      {assignments.length === 0 ? <EmptyState title="No assignments yet" icon="person-outline" /> : null}
      <View style={{ gap: spacing.sm }}>
        {assignments.map((a) => (
          <Card key={a.id} flat>
            <View style={styles.row}>
              <Avatar name={a.staffName} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {a.className} · {a.subjectName}
                </Text>
                <Text style={styles.rowCaption}>{a.staffName}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${a.className} ${a.subjectName} assignment`}
                hitSlop={8}
                onPress={() => void remove(a.id)}
                style={{ padding: spacing.xs }}
              >
                <Icon name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          </Card>
        ))}
      </View>
      {adding ? (
        <Card>
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
        </Card>
      ) : null}
    </View>
  );
}

function FormActions({
  onSave,
  onCancel,
  busy,
  disabled,
  onDelete,
  deleteBusy,
}: {
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: onDelete ? 'space-between' : 'flex-start', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        <Button label="Save" size="sm" icon="checkmark-circle-outline" onPress={onSave} loading={busy} disabled={disabled} />
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
      </View>
      {onDelete ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Delete" hitSlop={8} disabled={deleteBusy} onPress={onDelete} style={{ padding: spacing.xs }}>
          {deleteBusy ? <ActivityIndicator size="small" color={colors.error} /> : <Icon name="trash-outline" size={18} color={colors.error} />}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statsCard: { flexDirection: 'row' },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...typography.title, color: semantic.primary },
  statLabel: { ...typography.caption, color: semantic.textSecondary },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: semantic.border },
  gradePill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { ...typography.bodyStrong, color: semantic.textPrimary },
  rowCaption: { ...typography.caption, color: semantic.textSecondary, marginTop: 2 },
  rowActive: { borderWidth: 1.5, borderColor: semantic.primary },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
