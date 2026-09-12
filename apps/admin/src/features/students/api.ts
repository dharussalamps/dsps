import { supabase } from '@/lib/supabase';
import { sanitizeFilterValue } from '@/lib/search';

export type StudentSummary = {
  id: string;
  admissionNo: string;
  fullName: string;
  preferredName: string | null;
  photoPath: string | null;
  status: 'active' | 'inactive' | 'left';
};

export type UnassignedStudent = StudentSummary & { hasAttendance: boolean };

export type ClassSummary = {
  id: string;
  name: string;
  gradeNumber: number;
  gradeName: string;
};

export type StudentProfile = StudentSummary & {
  dateOfBirth: string | null;
  gender: 'male' | 'female' | null;
  photoConsent: boolean;
  className: string | null;
  rollNo: string | null;
};

export type GuardianContact = {
  guardianId: string;
  fullName: string;
  relationship: string | null;
  phonePrimary: string;
  phoneAlt: string | null;
  isPrimary: boolean;
  nicNumber: string | null;
  email: string | null;
  occupation: string | null;
  economicStatus: string | null;
  address: string | null;
  gsDivision: string | null;
};

type StudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  preferred_name: string | null;
  photo_path: string | null;
  status: string;
};

// There's no generated Database type here (no live Supabase project to run
// `supabase gen types` against — see backend/README.md), so the client is
// untyped and can't infer embedded-relation cardinality on its own;
// .returns<T[]>() asserts the shape we know each query actually produces.

/**
 * Search by partial admission number or name, within whatever the caller's
 * RLS scope allows. When `classIds` is given (one class, or every class in
 * a grade), scopes the search to those classes' current-year rosters (via
 * student_enrolments) instead of the whole school.
 */
export async function searchStudents(query: string, classIds?: string[]): Promise<(StudentSummary & { rollNo?: string | null; classId?: string })[]> {
  const term = sanitizeFilterValue(query);
  if (!term) return [];

  if (classIds && classIds.length > 0) {
    const { data, error } = await supabase
      .from('student_enrolments')
      .select('roll_no, class_id, students!inner(id, admission_no, full_name, preferred_name, photo_path, status)')
      .in('class_id', classIds)
      .or(`admission_no.ilike.%${term}%,full_name.ilike.%${term}%`, { foreignTable: 'students' })
      .neq('students.status', 'left')
      .order('full_name', { foreignTable: 'students' })
      .limit(30)
      .returns<{ roll_no: string | null; class_id: string; students: StudentRow | null }[]>();

    if (error) throw error;
    return (data ?? [])
      .filter((row) => row.students != null)
      .map((row) => ({ ...toStudentSummary(row.students as StudentRow), rollNo: row.roll_no, classId: row.class_id }));
  }

  const { data, error } = await supabase
    .from('students')
    .select('id, admission_no, full_name, preferred_name, photo_path, status')
    .or(`admission_no.ilike.%${term}%,full_name.ilike.%${term}%`)
    // FR-STU-12: a student marked 'left' is excluded from rosters and counts.
    .neq('status', 'left')
    .order('full_name')
    .limit(30)
    .returns<StudentRow[]>();

  if (error) throw error;
  return (data ?? []).map(toStudentSummary);
}

export async function listClasses(): Promise<ClassSummary[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('id, name, grades(number, name), academic_years!inner(is_current)')
    .eq('academic_years.is_current', true)
    .order('name')
    .returns<{ id: string; name: string; grades: { number: number; name: string } | null }[]>();

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    gradeNumber: row.grades?.number ?? 0,
    gradeName: row.grades?.name ?? '',
  }));
}

export async function listStudentsInClass(classId: string): Promise<(StudentSummary & { rollNo: string | null })[]> {
  const { data, error } = await supabase
    .from('student_enrolments')
    .select('roll_no, students!inner(id, admission_no, full_name, preferred_name, photo_path, status)')
    .eq('class_id', classId)
    // FR-STU-12: excluded from rosters and counts once marked 'left'.
    .neq('students.status', 'left')
    .order('roll_no')
    .returns<{ roll_no: string | null; students: StudentRow | null }[]>();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.students != null)
    .map((row) => ({ ...toStudentSummary(row.students as StudentRow), rollNo: row.roll_no }));
}

/** Same shape as listStudentsInClass, but across every class in a set (e.g. a whole grade). */
export async function listStudentsInClasses(classIds: string[]): Promise<(StudentSummary & { rollNo: string | null; classId: string })[]> {
  if (classIds.length === 0) return [];

  const { data, error } = await supabase
    .from('student_enrolments')
    .select('roll_no, class_id, students!inner(id, admission_no, full_name, preferred_name, photo_path, status)')
    .in('class_id', classIds)
    .neq('students.status', 'left')
    .order('full_name', { foreignTable: 'students' })
    .returns<{ roll_no: string | null; class_id: string; students: StudentRow | null }[]>();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.students != null)
    .map((row) => ({ ...toStudentSummary(row.students as StudentRow), rollNo: row.roll_no, classId: row.class_id }));
}

/** Students with no enrolment in the current academic year — see list_unassigned_students() migration comment for why this is an RPC rather than a plain select. */
export async function listUnassignedStudents(): Promise<UnassignedStudent[]> {
  const { data, error } = await supabase.rpc('list_unassigned_students');
  if (error) throw error;
  return ((data ?? []) as unknown as (StudentRow & { has_attendance: boolean })[]).map((row) => ({
    ...toStudentSummary(row),
    hasAttendance: row.has_attendance,
  }));
}

/** Search scoped to students already enrolled somewhere this year, each tagged with their current class — the "remove from class" tab's search. */
export async function searchEnrolledStudents(query: string): Promise<(StudentSummary & { classId: string; className: string })[]> {
  const term = sanitizeFilterValue(query);
  if (!term) return [];

  const { data, error } = await supabase
    .from('student_enrolments')
    .select('class_id, classes!inner(name), academic_years!inner(is_current), students!inner(id, admission_no, full_name, preferred_name, photo_path, status)')
    .eq('academic_years.is_current', true)
    .or(`admission_no.ilike.%${term}%,full_name.ilike.%${term}%`, { foreignTable: 'students' })
    .neq('students.status', 'left')
    .order('full_name', { foreignTable: 'students' })
    .limit(30)
    .returns<{ class_id: string; classes: { name: string } | null; students: StudentRow | null }[]>();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.students != null)
    .map((row) => ({ ...toStudentSummary(row.students as StudentRow), classId: row.class_id, className: row.classes?.name ?? '' }));
}

/** Enrols a currently-unassigned student into a class for the current academic year. */
export async function setStudentClass(studentId: string, classId: string): Promise<void> {
  const { error } = await supabase.rpc('set_student_class', { p_student_id: studentId, p_class_id: classId });
  if (error) throw error;
}

/** Clears a student's current-year enrolment, returning them to the unassigned list. */
export async function removeStudentFromClass(studentId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_student_from_class', { p_student_id: studentId });
  if (error) throw error;
}

export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const [{ data: student, error: studentError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    supabase
      .from('students')
      .select('id, admission_no, full_name, preferred_name, date_of_birth, gender, photo_path, photo_consent, status')
      .eq('id', studentId)
      .maybeSingle()
      .returns<(StudentRow & { date_of_birth: string | null; gender: 'male' | 'female' | null; photo_consent: boolean }) | null>(),
    supabase
      .from('student_enrolments')
      .select('roll_no, classes(name), academic_years!inner(is_current)')
      .eq('student_id', studentId)
      .eq('academic_years.is_current', true)
      .maybeSingle()
      .returns<{ roll_no: string | null; classes: { name: string } | null } | null>(),
  ]);

  if (studentError) throw studentError;
  if (enrolmentError) throw enrolmentError;
  if (!student) return null;

  return {
    ...toStudentSummary(student),
    dateOfBirth: student.date_of_birth,
    gender: student.gender,
    photoConsent: student.photo_consent,
    className: enrolment?.classes?.name ?? null,
    rollNo: enrolment?.roll_no ?? null,
  };
}

/** FR-STU-08: "after a call placed from the app, the user is prompted to record its purpose in one line, retained against the student." */
export async function logCall(input: { studentId: string; guardianId?: string; purpose: string; callerId: string }): Promise<void> {
  const { error } = await supabase.from('call_logs').insert({
    student_id: input.studentId,
    guardian_id: input.guardianId || null,
    caller_id: input.callerId,
    purpose: input.purpose || null,
  });
  if (error) throw error;
}

export type NewStudentInput = {
  admissionNo: string;
  fullName: string;
  preferredName?: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  className?: string;
};

/**
 * Routes through the same `import_students` RPC the CSV import uses
 * (20260907210001_import_students.sql) — the only write path that also
 * handles class enrolment, since student_enrolments has no client insert
 * policy of its own. Returns the new student's id (the RPC itself only
 * reports back admission_no, so it's looked up once creation succeeds).
 */
export async function createStudent(input: NewStudentInput): Promise<string> {
  const { data, error } = await supabase.rpc('import_students', {
    p_rows: [
      {
        admission_no: input.admissionNo,
        full_name: input.fullName,
        preferred_name: input.preferredName || undefined,
        date_of_birth: input.dateOfBirth || undefined,
        gender: input.gender,
        class_name: input.className || undefined,
      },
    ],
  });
  if (error) throw error;
  const result = ((data ?? []) as unknown as { accepted: boolean; error: string | null }[])[0];
  if (!result?.accepted) throw new Error(result?.error ?? 'Could not create student.');

  const { data: student, error: findError } = await supabase
    .from('students')
    .select('id')
    .eq('admission_no', input.admissionNo)
    .single();
  if (findError) throw findError;
  return (student as { id: string }).id;
}

/** FR-STU-12: marks a student left (or reactivates one), retaining all their records. */
export async function setStudentStatus(studentId: string, status: 'active' | 'inactive' | 'left', reason?: string): Promise<void> {
  const { error } = await supabase.rpc('set_student_status', { p_student_id: studentId, p_status: status, p_reason: reason || null });
  if (error) throw error;
}

/**
 * Permanently erases a student record — unlike setStudentStatus('left'),
 * this cannot be undone. The RPC itself refuses when the student is
 * currently assigned to a class or has any attendance recorded, so this is
 * only ever safe to offer from the unassigned list.
 */
export async function deleteStudent(studentId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('delete_student', { p_student_id: studentId, p_reason: reason || null });
  if (error) throw error;
}

/** Returns [] when the caller lacks student.view_guardian_contact — RLS on
 * the underlying view just yields no rows, not an error. */
export async function getStudentGuardians(studentId: string): Promise<GuardianContact[]> {
  const { data, error } = await supabase
    .from('student_guardians_contact')
    .select(
      'guardian_id, full_name, relationship, phone_primary, phone_alt, is_primary, nic_number, email, occupation, economic_status, address, gs_division',
    )
    .eq('student_id', studentId)
    .returns<
      {
        guardian_id: string;
        full_name: string;
        relationship: string | null;
        phone_primary: string;
        phone_alt: string | null;
        is_primary: boolean;
        nic_number: string | null;
        email: string | null;
        occupation: string | null;
        economic_status: string | null;
        address: string | null;
        gs_division: string | null;
      }[]
    >();

  if (error) throw error;
  return (data ?? []).map((row) => ({
    guardianId: row.guardian_id,
    fullName: row.full_name,
    relationship: row.relationship,
    phonePrimary: row.phone_primary,
    phoneAlt: row.phone_alt,
    isPrimary: row.is_primary,
    nicNumber: row.nic_number,
    email: row.email,
    occupation: row.occupation,
    economicStatus: row.economic_status,
    address: row.address,
    gsDivision: row.gs_division,
  }));
}

export type Achievement = { id: string; title: string; category: string | null; level: string | null; achievedOn: string };
export type Membership = { id: string; groupName: string; position: string | null; startedOn: string | null; endedOn: string | null };
export type Benefit = { id: string; scheme: string; status: 'pending' | 'issued' | 'active' | 'ended'; issuedOn: string | null; notes: string | null };

export async function fetchAchievements(studentId: string): Promise<Achievement[]> {
  const { data, error } = await supabase
    .from('achievements')
    .select('id, title, category, level, achieved_on')
    .eq('student_id', studentId)
    .order('achieved_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, category: r.category, level: r.level, achievedOn: r.achieved_on }));
}

export async function addAchievement(input: { studentId: string; title: string; category?: string; level?: string; achievedOn: string; recordedBy: string }): Promise<void> {
  const { error } = await supabase.from('achievements').insert({
    student_id: input.studentId,
    title: input.title,
    category: input.category || null,
    level: input.level || null,
    achieved_on: input.achievedOn,
    recorded_by: input.recordedBy,
  });
  if (error) throw error;
}

export async function fetchMemberships(studentId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, group_name, position, started_on, ended_on')
    .eq('student_id', studentId)
    .order('started_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, groupName: r.group_name, position: r.position, startedOn: r.started_on, endedOn: r.ended_on }));
}

export async function addMembership(input: { studentId: string; groupName: string; position?: string; startedOn?: string; endedOn?: string }): Promise<void> {
  const { error } = await supabase.from('memberships').insert({
    student_id: input.studentId,
    group_name: input.groupName,
    position: input.position || null,
    started_on: input.startedOn || null,
    ended_on: input.endedOn || null,
  });
  if (error) throw error;
}

/** [] both when there are none and when the caller lacks student.view_benefits — RLS, not an error, tells them apart. */
export async function fetchBenefits(studentId: string): Promise<Benefit[]> {
  const { data, error } = await supabase
    .from('benefits')
    .select('id, scheme, status, issued_on, notes')
    .eq('student_id', studentId);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, scheme: r.scheme, status: r.status as Benefit['status'], issuedOn: r.issued_on, notes: r.notes }));
}

/** FR-ACH-04: "a benefit may be recorded against a student with scheme, period, and a status of issued, pending or active." */
export async function addBenefit(input: { studentId: string; scheme: string; academicYearId?: string | null; status?: 'pending' | 'issued' | 'active' }): Promise<void> {
  const { error } = await supabase.from('benefits').insert({
    student_id: input.studentId,
    scheme: input.scheme,
    academic_year_id: input.academicYearId || null,
    status: input.status ?? 'pending',
  });
  if (error) throw error;
}

export async function markBenefitIssued(benefitId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('benefits')
    .update({ status: 'issued', issued_on: new Date().toISOString().slice(0, 10), issued_by: staffId })
    .eq('id', benefitId);
  if (error) throw error;
}

function toStudentSummary(row: StudentRow): StudentSummary {
  return {
    id: row.id,
    admissionNo: row.admission_no,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    photoPath: row.photo_path,
    status: row.status as StudentSummary['status'],
  };
}
