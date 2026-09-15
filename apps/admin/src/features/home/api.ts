import { supabase } from '@/lib/supabase';

export type MyClass = {
  classId: string;
  className: string;
};

/** Classes the signed-in staff member teaches directly, or actively covers today (section 10, Home's "my class" card condition). */
export async function fetchMyClasses(staffId: string): Promise<MyClass[]> {
  const [{ data: owned, error: ownedError }, { data: covered, error: coveredError }] = await Promise.all([
    supabase.from('classes').select('id, name').eq('class_teacher_id', staffId),
    supabase
      .from('cover_assignments')
      .select('class_id, classes(name)')
      .eq('staff_id', staffId)
      .lte('starts_on', new Date().toISOString().slice(0, 10))
      .gte('ends_on', new Date().toISOString().slice(0, 10))
      .returns<{ class_id: string; classes: { name: string } | null }[]>(),
  ]);

  if (ownedError) throw ownedError;
  if (coveredError) throw coveredError;

  const result = new Map<string, MyClass>();
  for (const c of owned ?? []) result.set(c.id, { classId: c.id, className: c.name });
  for (const c of covered ?? []) {
    if (c.classes) result.set(c.class_id, { classId: c.class_id, className: c.classes.name });
  }
  return Array.from(result.values());
}

export async function fetchIsSchoolDayToday(): Promise<boolean> {
  const onDate = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('is_school_day', { p_date: onDate });
  if (error) throw error;
  return Boolean(data);
}

export type UncoveredClass = { classId: string; className: string; teacherId: string; teacherName: string; teacherStatus: string };

/** Home "Needs attention": a class whose own teacher is absent/on leave today with no active cover assigned. */
export async function fetchClassesNeedingCover(onDate: string): Promise<UncoveredClass[]> {
  const { data, error } = await supabase.rpc('classes_needing_cover', { p_on_date: onDate });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { class_id: string; class_name: string; teacher_id: string; teacher_name: string; teacher_status: string }[];
  return rows.map((r) => ({ classId: r.class_id, className: r.class_name, teacherId: r.teacher_id, teacherName: r.teacher_name, teacherStatus: r.teacher_status }));
}

export type Birthday = { personType: 'student' | 'staff'; id: string; fullName: string; detail: string | null };

/** Home "Birthdays" widget. */
export async function fetchTodaysBirthdays(): Promise<Birthday[]> {
  const { data, error } = await supabase.rpc('todays_birthdays');
  if (error) throw error;
  const rows = (data ?? []) as unknown as { person_type: 'student' | 'staff'; id: string; full_name: string; detail: string | null }[];
  return rows.map((r) => ({ personType: r.person_type, id: r.id, fullName: r.full_name, detail: r.detail }));
}

export type AcademicPerformanceSummary = { avgPct: number | null; atRiskCount: number };

/** Home "Academic performance" widget — current-term snapshot, scoped by the caller's own marks.enter/marks.review classes. */
export async function fetchAcademicPerformanceSummary(): Promise<AcademicPerformanceSummary> {
  const { data, error } = await supabase.rpc('academic_performance_summary').maybeSingle();
  if (error) throw error;
  const row = data as unknown as { avg_pct: number | null; at_risk_count: number } | null;
  return { avgPct: row?.avg_pct ?? null, atRiskCount: row?.at_risk_count ?? 0 };
}

export type StaffOnLeave = { staffId: string; fullName: string };

/** School Pulse's "on leave today" row. */
export async function fetchStaffOnLeaveToday(): Promise<StaffOnLeave[]> {
  const { data, error } = await supabase.rpc('staff_on_leave_today');
  if (error) throw error;
  const rows = (data ?? []) as unknown as { staff_id: string; full_name: string }[];
  return rows.map((r) => ({ staffId: r.staff_id, fullName: r.full_name }));
}

export type AttendanceTrendPoint = { onDate: string; pct: number | null };

/** MyClassAttendanceCard's 7-school-day sparkline. */
export async function fetchClassAttendanceTrend(classId: string): Promise<AttendanceTrendPoint[]> {
  const { data, error } = await supabase.rpc('class_attendance_trend', { p_class_id: classId });
  if (error) throw error;
  const rows = (data ?? []) as unknown as { on_date: string; pct: number | null }[];
  return rows.map((r) => ({ onDate: r.on_date, pct: r.pct }));
}

/** School-wide student attendance so far today, for School Pulse's 3rd metric — counts only classes marked so far, relying on student_attendance's own RLS (attendance.view_board/attendance.mark, per class) to scope the rows, same as every other Home read. */
export type StudentAttendanceToday = { presentCount: number; totalMarked: number };

export async function fetchStudentAttendanceToday(onDate: string): Promise<StudentAttendanceToday> {
  const { data, error } = await supabase.from('student_attendance').select('status').eq('on_date', onDate).returns<{ status: string }[]>();
  if (error) throw error;
  const rows = data ?? [];
  return { presentCount: rows.filter((r) => r.status === 'present' || r.status === 'late').length, totalMarked: rows.length };
}

/** Every explicit calendar_days row (holidays, closures, half days) in the next 30 days, plus the current term's end date, for the "Calendar overview" widget. */
export type CalendarOverview = {
  upcoming: { onDate: string; dayType: string; label: string | null }[];
  currentTermEndsOn: string | null;
};

export async function fetchCalendarOverview(): Promise<CalendarOverview> {
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: days, error: daysError }, { data: term, error: termError }] = await Promise.all([
    supabase.from('calendar_days').select('on_date, day_type, label').gte('on_date', today).lte('on_date', in30Days).order('on_date'),
    supabase.from('terms').select('ends_on').lte('starts_on', today).gte('ends_on', today).maybeSingle(),
  ]);
  if (daysError) throw daysError;
  if (termError) throw termError;
  return {
    upcoming: (days ?? [])
      .filter((d) => d.day_type === 'holiday' || d.day_type === 'closure' || d.day_type === 'half_day')
      .map((d) => ({ onDate: d.on_date, dayType: d.day_type, label: d.label })),
    currentTermEndsOn: term?.ends_on ?? null,
  };
}

/** Active students grouped by grade for the current academic year, for the "Student enrolment" widget. */
export type EnrollmentSnapshot = { totalStudents: number; gradeBreakdown: { gradeName: string; count: number }[] };

export async function fetchEnrollmentSnapshot(): Promise<EnrollmentSnapshot> {
  const { data: year, error: yearError } = await supabase.from('academic_years').select('id').eq('is_current', true).maybeSingle();
  if (yearError) throw yearError;
  if (!year) return { totalStudents: 0, gradeBreakdown: [] };

  const { data, error } = await supabase
    .from('student_enrolments')
    .select('student_id, classes(grades(name))')
    .eq('academic_year_id', year.id)
    .returns<{ student_id: string; classes: { grades: { name: string } | null } | null }[]>();
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const name = r.classes?.grades?.name ?? 'Unassigned';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return {
    totalStudents: (data ?? []).length,
    gradeBreakdown: Array.from(counts.entries()).map(([gradeName, count]) => ({ gradeName, count })),
  };
}

/** Students and staff added since the current term started, for the "New this term" widget. */
export type NewThisTerm = { newStudents: number; newStaff: number };

export async function fetchNewThisTerm(): Promise<NewThisTerm> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: term, error: termError } = await supabase.from('terms').select('starts_on').lte('starts_on', today).gte('ends_on', today).maybeSingle();
  if (termError) throw termError;
  if (!term) return { newStudents: 0, newStaff: 0 };

  const [{ count: newStudents, error: studentsError }, { count: newStaff, error: staffError }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).gte('created_at', term.starts_on),
    supabase.from('staff').select('id', { count: 'exact', head: true }).gte('created_at', term.starts_on),
  ]);
  if (studentsError) throw studentsError;
  if (staffError) throw staffError;
  return { newStudents: newStudents ?? 0, newStaff: newStaff ?? 0 };
}

/**
 * Today's early departures, school-wide — unlike listEarlyLeavesToday (scoped to one class's
 * roster for a class screen), this has no studentIds filter and relies entirely on
 * early_leaves' own RLS (attendance.early_leave, per class) to scope the result, same
 * unguarded-read convention as the rest of Home's widgets. Deliberately omits class name: a
 * student can have more than one student_enrolments row across academic years, and there's no
 * single-hop way to filter that embed down to just the current year, so showing it risked
 * naming the wrong (or an arbitrary) class — name + time is enough for a Home widget.
 */
export type EarlyLeaveToday = { id: string; studentName: string; leftAt: string; reason: string | null };

export async function fetchEarlyLeavesToday(onDate: string): Promise<EarlyLeaveToday[]> {
  const { data, error } = await supabase
    .from('early_leaves')
    .select('id, left_at, reason, students(full_name)')
    .eq('on_date', onDate)
    .returns<{ id: string; left_at: string; reason: string | null; students: { full_name: string } | null }[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    studentName: r.students?.full_name ?? '',
    leftAt: r.left_at,
    reason: r.reason,
  }));
}

/** Cover assignments active today or starting within the next 7 days, for the "Cover assignments" widget — filters fetchCoverAssignmentsByYear's (leave/api.ts) unscoped result rather than duplicating its query. */
export type UpcomingCoverAssignment = { id: string; className: string; staffName: string; startsOn: string; endsOn: string };

export async function fetchUpcomingCoverAssignments(): Promise<UpcomingCoverAssignment[]> {
  const { fetchCoverAssignmentsByYear } = await import('@/features/leave/api');
  const all = await fetchCoverAssignmentsByYear();
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  return all
    .filter((a) => a.endsOn >= today && a.startsOn <= in7Days)
    .map((a) => ({ id: a.id, className: a.className, staffName: a.staffName, startsOn: a.startsOn, endsOn: a.endsOn }));
}

/** Events over the next 7 days, for the "This week's events" widget — reuses events/api.ts's listEventsInMonth (month-scoped) across however many calendar months the window spans, same as HomeScreen's own "today's events" query but with a wider range. */
export async function fetchThisWeeksEvents(): Promise<{ id: string; title: string; startsOn: string; endsOn: string | null }[]> {
  const { listEventsInMonth } = await import('@/features/events/api');
  const today = new Date();
  const weekEnd = new Date(today.getTime() + 7 * 86_400_000);
  const todayIso = today.toISOString().slice(0, 10);
  const weekEndIso = weekEnd.toISOString().slice(0, 10);

  const months = new Set<string>();
  months.add(`${today.getFullYear()}-${today.getMonth() + 1}`);
  months.add(`${weekEnd.getFullYear()}-${weekEnd.getMonth() + 1}`);

  const results = await Promise.all(
    Array.from(months).map((m) => {
      const [y, mo] = m.split('-').map(Number);
      return listEventsInMonth(y, mo);
    }),
  );
  const seen = new Map<string, { id: string; title: string; startsOn: string; endsOn: string | null }>();
  for (const events of results) {
    for (const e of events) {
      if ((e.endsOn ?? e.startsOn) >= todayIso && e.startsOn <= weekEndIso) seen.set(e.id, { id: e.id, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}
