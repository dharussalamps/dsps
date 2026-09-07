import { supabase } from '@/lib/supabase';
import type { SubmitAttendancePayload } from './schema';
import type { CachedRosterStudent } from './rosterCache';

export type MarkingStatusRow = {
  classId: string;
  className: string;
  gradeNumber: number;
  teacherId: string | null;
  teacherName: string | null;
  submitted: boolean;
  absentCount: number;
};

type MarkingStatusRpcRow = {
  class_id: string;
  class_name: string;
  grade_number: number;
  teacher_id: string | null;
  teacher_name: string | null;
  submitted: boolean;
  absent_count: number;
};

/** v_class_marking_status(on_date) — already ordered unmarked-first (section 6.4 / FR-ATT-10). */
export async function fetchMarkingStatus(onDate: string): Promise<MarkingStatusRow[]> {
  // .returns<T[]>() fights with the client's own inference for this RPC
  // (it assumes a single-row result unless told otherwise some other way);
  // a plain cast after the await is the reliable option here.
  const { data, error } = await supabase.rpc('v_class_marking_status', { p_on_date: onDate });
  if (error) throw error;

  const rows = (data ?? []) as unknown as MarkingStatusRpcRow[];
  return rows.map((r) => ({
    classId: r.class_id,
    className: r.class_name,
    gradeNumber: r.grade_number,
    teacherId: r.teacher_id,
    teacherName: r.teacher_name,
    submitted: r.submitted,
    absentCount: r.absent_count,
  }));
}

export async function fetchRosterForCaching(classId: string): Promise<CachedRosterStudent[]> {
  const { data, error } = await supabase
    .from('student_enrolments')
    .select('roll_no, students(id, full_name, preferred_name, photo_path)')
    .eq('class_id', classId)
    .order('roll_no')
    .returns<
      { roll_no: string | null; students: { id: string; full_name: string; preferred_name: string | null; photo_path: string | null } | null }[]
    >();

  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.students != null)
    .map((row) => ({
      id: row.students!.id,
      fullName: row.students!.full_name,
      preferredName: row.students!.preferred_name,
      photoPath: row.students!.photo_path,
      rollNo: row.roll_no,
    }));
}

export type StaffAttendanceRow = {
  staffId: string;
  fullName: string;
  status: 'present' | 'late' | 'on_leave' | 'absent' | 'not_checked_in';
  checkedInAt: string | null;
};

/** section 10: AttendanceBoard's "switch student/staff tab". RLS narrows this to what the caller may see (attendance.view_board, or just their own row). */
export async function fetchStaffAttendanceToday(onDate: string): Promise<StaffAttendanceRow[]> {
  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('id, full_name')
    .eq('status', 'active')
    .order('full_name');
  if (staffError) throw staffError;

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('staff_attendance')
    .select('staff_id, status, checked_in_at')
    .eq('on_date', onDate)
    .returns<{ staff_id: string; status: string; checked_in_at: string | null }[]>();
  if (attendanceError) throw attendanceError;

  const byStaff = new Map(attendanceRows?.map((r) => [r.staff_id, r]));
  return (staffRows ?? []).map((s) => {
    const a = byStaff.get(s.id);
    return {
      staffId: s.id,
      fullName: s.full_name,
      status: (a?.status as StaffAttendanceRow['status']) ?? 'not_checked_in',
      checkedInAt: a?.checked_in_at ?? null,
    };
  });
}

export async function fetchMyAttendanceToday(staffId: string, onDate: string): Promise<{ status: string; checkedInAt: string | null } | null> {
  const { data, error } = await supabase
    .from('staff_attendance')
    .select('status, checked_in_at')
    .eq('staff_id', staffId)
    .eq('on_date', onDate)
    .maybeSingle();
  if (error) throw error;
  return data ? { status: data.status, checkedInAt: data.checked_in_at } : null;
}

export async function checkInSelf(): Promise<void> {
  const { error } = await supabase.rpc('check_in_self');
  if (error) throw error;
}

export async function remindUnmarkedClass(classId: string): Promise<void> {
  const { error } = await supabase.rpc('remind_unmarked_class', { p_class_id: classId });
  if (error) throw error;
}

export type SubmitAttendanceResult = {
  submissionId: string;
  absentees: { studentId: string; fullName: string; consecutiveAbsences: number }[];
};

/** Calls the submit-attendance Edge Function directly (used when online; the offline queue handler also calls this). */
export async function submitAttendanceOnline(payload: SubmitAttendancePayload): Promise<SubmitAttendanceResult> {
  const { data, error } = await supabase.functions.invoke<{
    submission_id: string;
    absentees: { student_id: string; full_name: string; consecutive_absences: number }[];
  }>('submit-attendance', { body: payload });

  if (error) throw error;
  if (!data) throw new Error('submit-attendance returned no data');

  return {
    submissionId: data.submission_id,
    absentees: data.absentees.map((a) => ({
      studentId: a.student_id,
      fullName: a.full_name,
      consecutiveAbsences: a.consecutive_absences,
    })),
  };
}

/** Primary guardian phone per student, where the caller holds student.view_guardian_contact — RLS just yields fewer rows otherwise. */
export async function fetchPrimaryGuardianPhones(studentIds: string[]): Promise<Record<string, string | null>> {
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('student_guardians_contact')
    .select('student_id, phone_primary, is_primary')
    .in('student_id', studentIds)
    .eq('is_primary', true)
    .returns<{ student_id: string; phone_primary: string; is_primary: boolean }[]>();

  if (error) throw error;
  const result: Record<string, string | null> = {};
  for (const row of data ?? []) result[row.student_id] = row.phone_primary;
  return result;
}

export type ExistingSubmission = {
  submissionId: string;
  submittedAt: string;
  absentees: { studentId: string; fullName: string; consecutiveAbsences: number }[];
};

/** For AttendanceSubmitted when reached after the fact (not straight from a fresh submit). */
export async function fetchExistingSubmission(classId: string, onDate: string): Promise<ExistingSubmission | null> {
  const { data: submission, error: submissionError } = await supabase
    .from('attendance_submissions')
    .select('id, submitted_at')
    .eq('class_id', classId)
    .eq('on_date', onDate)
    .maybeSingle();
  if (submissionError) throw submissionError;
  if (!submission) return null;

  const { data: absentRows, error: absentError } = await supabase
    .from('student_attendance')
    .select('student_id, students(full_name)')
    .eq('class_id', classId)
    .eq('on_date', onDate)
    .eq('status', 'absent')
    .returns<{ student_id: string; students: { full_name: string } | null }[]>();
  if (absentError) throw absentError;

  const absentees = await Promise.all(
    (absentRows ?? []).map(async (row) => {
      const { data: count } = await supabase.rpc('consecutive_absences', {
        p_student: row.student_id,
        p_as_of: onDate,
      });
      return {
        studentId: row.student_id,
        fullName: row.students?.full_name ?? '',
        consecutiveAbsences: (count as number) ?? 0,
      };
    }),
  );

  return { submissionId: submission.id, submittedAt: submission.submitted_at, absentees };
}
