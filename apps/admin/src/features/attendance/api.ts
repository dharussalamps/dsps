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
  /** FR-SAT-04: set when this staff member is a class teacher and they're not present today. */
  affectedClass: { classId: string; className: string; marked: boolean } | null;
};

/** section 10: AttendanceBoard's "switch student/staff tab". RLS narrows this to what the caller may see (attendance.view_board, or just their own row). */
export async function fetchStaffAttendanceToday(onDate: string): Promise<StaffAttendanceRow[]> {
  const [{ data: staffRows, error: staffError }, { data: attendanceRows, error: attendanceError }, { data: classRows, error: classError }, { data: submissionRows, error: submissionError }] =
    await Promise.all([
      supabase.from('staff').select('id, full_name').eq('status', 'active').order('full_name'),
      supabase
        .from('staff_attendance')
        .select('staff_id, status, checked_in_at')
        .eq('on_date', onDate)
        .returns<{ staff_id: string; status: string; checked_in_at: string | null }[]>(),
      supabase
        .from('classes')
        .select('id, name, class_teacher_id, academic_years!inner(is_current)')
        .eq('academic_years.is_current', true)
        .not('class_teacher_id', 'is', null)
        .returns<{ id: string; name: string; class_teacher_id: string | null }[]>(),
      supabase.from('attendance_submissions').select('class_id').eq('on_date', onDate),
    ]);
  if (staffError) throw staffError;
  if (attendanceError) throw attendanceError;
  if (classError) throw classError;
  if (submissionError) throw submissionError;

  const byStaff = new Map(attendanceRows?.map((r) => [r.staff_id, r]));
  const classByTeacher = new Map((classRows ?? []).map((c) => [c.class_teacher_id as string, c]));
  const submittedClassIds = new Set((submissionRows ?? []).map((r) => r.class_id));

  return (staffRows ?? []).map((s) => {
    const a = byStaff.get(s.id);
    const status = (a?.status as StaffAttendanceRow['status']) ?? 'not_checked_in';
    const theirClass = classByTeacher.get(s.id);
    const affectedClass =
      status !== 'present' && status !== 'late' && theirClass
        ? { classId: theirClass.id, className: theirClass.name, marked: submittedClassIds.has(theirClass.id) }
        : null;
    return { staffId: s.id, fullName: s.full_name, status, checkedInAt: a?.checked_in_at ?? null, affectedClass };
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

/** FR-ATT-12: reminds every unmarked class in the caller's scope in one action. Returns how many were actually reminded. */
export async function remindUnmarkedClassesBulk(onDate: string): Promise<number> {
  const { data, error } = await supabase.rpc('remind_unmarked_classes_bulk', { p_on_date: onDate });
  if (error) throw error;
  return (data as number) ?? 0;
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

  const studentIds = (absentRows ?? []).map((r) => r.student_id);
  const { data: counts, error: countsError } = await supabase.rpc('consecutive_absences_batch', {
    p_student_ids: studentIds,
    p_as_of: onDate,
  });
  if (countsError) throw countsError;
  const countRows = (counts ?? []) as unknown as { student_id: string; days: number }[];
  const countByStudent = new Map(countRows.map((c) => [c.student_id, c.days]));

  const absentees = (absentRows ?? []).map((row) => ({
    studentId: row.student_id,
    fullName: row.students?.full_name ?? '',
    consecutiveAbsences: countByStudent.get(row.student_id) ?? 0,
  }));

  return { submissionId: submission.id, submittedAt: submission.submitted_at, absentees };
}

export type StudentAttendanceDay = {
  onDate: string;
  status: 'present' | 'absent' | 'late';
  reason: string | null;
  earlyLeave: { leftAt: string; reason: string | null } | null;
};

/** FR-ATT-14: a student's attendance for one calendar month, school days only (rows simply don't exist for non-school days). */
export async function fetchStudentAttendanceMonth(studentId: string, monthStartIso: string, monthEndIso: string): Promise<StudentAttendanceDay[]> {
  const [{ data: attendance, error: attendanceError }, { data: earlyLeaves, error: earlyLeaveError }] = await Promise.all([
    supabase
      .from('student_attendance')
      .select('on_date, status, reason')
      .eq('student_id', studentId)
      .gte('on_date', monthStartIso)
      .lte('on_date', monthEndIso)
      .order('on_date'),
    supabase
      .from('early_leaves')
      .select('on_date, left_at, reason')
      .eq('student_id', studentId)
      .gte('on_date', monthStartIso)
      .lte('on_date', monthEndIso),
  ]);
  if (attendanceError) throw attendanceError;
  if (earlyLeaveError) throw earlyLeaveError;

  const earlyByDate = new Map((earlyLeaves ?? []).map((e) => [e.on_date, { leftAt: e.left_at, reason: e.reason }]));
  return (attendance ?? []).map((row) => ({
    onDate: row.on_date,
    status: row.status as StudentAttendanceDay['status'],
    reason: row.reason,
    earlyLeave: earlyByDate.get(row.on_date) ?? null,
  }));
}

/**
 * FR-ATT-05/06/08: correct a day's status (within the edit window, or after
 * it with attendance.amend_locked + a mandatory reason) or simply attach a
 * reason without changing status. The amend_student_attendance RLS policy
 * (20260907110001_attendance.sql) is the real enforcement — this is a plain
 * update, and a rejection surfaces as a Postgres RLS error the caller
 * should show as "you can no longer edit this" rather than a generic
 * failure.
 */
export async function amendStudentAttendance(
  studentId: string,
  onDate: string,
  changes: { status?: 'present' | 'absent' | 'late'; reason?: string | null },
): Promise<void> {
  const { error } = await supabase.from('student_attendance').update(changes).eq('student_id', studentId).eq('on_date', onDate);
  if (error) throw error;
}
