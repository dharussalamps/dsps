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

export type ClassSummary = {
  id: string;
  name: string;
  gradeNumber: number;
  gradeName: string;
};

export type StudentProfile = StudentSummary & {
  dateOfBirth: string | null;
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

/** Search by partial admission number or name, within whatever the caller's RLS scope allows. */
export async function searchStudents(query: string): Promise<StudentSummary[]> {
  const term = sanitizeFilterValue(query);
  if (!term) return [];

  const { data, error } = await supabase
    .from('students')
    .select('id, admission_no, full_name, preferred_name, photo_path, status')
    .or(`admission_no.ilike.%${term}%,full_name.ilike.%${term}%`)
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
    .select('roll_no, students(id, admission_no, full_name, preferred_name, photo_path, status)')
    .eq('class_id', classId)
    .order('roll_no')
    .returns<{ roll_no: string | null; students: StudentRow | null }[]>();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.students != null)
    .map((row) => ({ ...toStudentSummary(row.students as StudentRow), rollNo: row.roll_no }));
}

export async function getStudentProfile(studentId: string): Promise<StudentProfile | null> {
  const [{ data: student, error: studentError }, { data: enrolment, error: enrolmentError }] = await Promise.all([
    supabase
      .from('students')
      .select('id, admission_no, full_name, preferred_name, date_of_birth, photo_path, photo_consent, status')
      .eq('id', studentId)
      .maybeSingle()
      .returns<(StudentRow & { date_of_birth: string | null; photo_consent: boolean }) | null>(),
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
    photoConsent: student.photo_consent,
    className: enrolment?.classes?.name ?? null,
    rollNo: enrolment?.roll_no ?? null,
  };
}

/** Returns [] when the caller lacks student.view_guardian_contact — RLS on
 * the underlying view just yields no rows, not an error. */
export async function getStudentGuardians(studentId: string): Promise<GuardianContact[]> {
  const { data, error } = await supabase
    .from('student_guardians_contact')
    .select('guardian_id, full_name, relationship, phone_primary, phone_alt, is_primary')
    .eq('student_id', studentId)
    .returns<
      {
        guardian_id: string;
        full_name: string;
        relationship: string | null;
        phone_primary: string;
        phone_alt: string | null;
        is_primary: boolean;
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
  }));
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
