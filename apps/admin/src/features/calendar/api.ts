import { supabase } from '@/lib/supabase';

export type Term = { id: string; name: string; sequence: number; startsOn: string; endsOn: string };

export async function fetchCurrentYearTerms(): Promise<Term[]> {
  const { data, error } = await supabase
    .from('academic_years')
    .select('id, terms(id, name, sequence, starts_on, ends_on)')
    .eq('is_current', true)
    .maybeSingle()
    .returns<{ id: string; terms: { id: string; name: string; sequence: number; starts_on: string; ends_on: string }[] } | null>();
  if (error) throw error;
  return (data?.terms ?? []).sort((a, b) => a.sequence - b.sequence).map((t) => ({ id: t.id, name: t.name, sequence: t.sequence, startsOn: t.starts_on, endsOn: t.ends_on }));
}

/** Terms for a specific academic year — unlike fetchCurrentYearTerms (always the current year), this backs pickers that operate on a year the user has explicitly chosen (e.g. creating an exam for a past year's class). */
export async function listTermsForYear(academicYearId: string): Promise<Term[]> {
  const { data, error } = await supabase
    .from('terms')
    .select('id, name, sequence, starts_on, ends_on')
    .eq('academic_year_id', academicYearId)
    .order('sequence')
    .returns<{ id: string; name: string; sequence: number; starts_on: string; ends_on: string }[]>();
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, name: t.name, sequence: t.sequence, startsOn: t.starts_on, endsOn: t.ends_on }));
}

export type SchoolSettings = {
  schoolName: string;
  attendanceDueAt: string;
  dayStartsAt: string;
  dayEndsAt: string;
  attendanceEditMinutes: number;
  riskConsecutiveDays: number;
  riskAttendancePct: number;
};

export async function fetchSchoolSettings(): Promise<SchoolSettings | null> {
  const { data, error } = await supabase
    .from('school_settings')
    .select('school_name, attendance_due_at, day_starts_at, day_ends_at, attendance_edit_minutes, risk_consecutive_days, risk_attendance_pct')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    schoolName: data.school_name,
    attendanceDueAt: data.attendance_due_at,
    dayStartsAt: data.day_starts_at,
    dayEndsAt: data.day_ends_at,
    attendanceEditMinutes: data.attendance_edit_minutes,
    riskConsecutiveDays: data.risk_consecutive_days,
    riskAttendancePct: data.risk_attendance_pct,
  };
}

export async function updateSchoolSettings(patch: Partial<{ attendance_due_at: string; attendance_edit_minutes: number; risk_consecutive_days: number; risk_attendance_pct: number }>): Promise<void> {
  const { error } = await supabase.from('school_settings').update(patch).eq('id', true);
  if (error) throw error;
}

export type AcademicYear = { id: string; label: string; startsOn: string; endsOn: string; isCurrent: boolean };

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const { data, error } = await supabase.from('academic_years').select('id, label, starts_on, ends_on, is_current').order('starts_on', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, label: r.label, startsOn: r.starts_on, endsOn: r.ends_on, isCurrent: r.is_current }));
}

/**
 * FR-CAL-01: "the principal defines an academic year with a start and end date."
 * is_current is never set here — a DB trigger (academic_years_sync_current, see
 * 20260916000000_sync_current_academic_year.sql) flips it to whichever year's
 * starts_on/ends_on actually contains today's date right after the insert commits,
 * so a future year created ahead of time doesn't wrongly become "current".
 */
export async function addAcademicYear(input: { label: string; startsOn: string; endsOn: string }): Promise<void> {
  const { error } = await supabase.from('academic_years').insert({ label: input.label, starts_on: input.startsOn, ends_on: input.endsOn });
  if (error) throw error;
}

/** FR-CAL-02: "the principal defines terms within the year, each with a start and end date. Terms may not overlap" (enforced by a DB exclusion constraint). */
export async function addTerm(input: { academicYearId: string; name: string; sequence: number; startsOn: string; endsOn: string }): Promise<void> {
  const { error } = await supabase.from('terms').insert({
    academic_year_id: input.academicYearId,
    name: input.name,
    sequence: input.sequence,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
  });
  if (error) throw error;
}

export async function updateAcademicYear(id: string, input: { label: string; startsOn: string; endsOn: string }): Promise<void> {
  const { error } = await supabase.from('academic_years').update({ label: input.label, starts_on: input.startsOn, ends_on: input.endsOn }).eq('id', id);
  if (error) throw error;
}

/** Fails with a foreign key violation (Postgres code 23503) while any class, enrolment, leave balance, benefit, responsibility, or event still references this year — that's the "only when unlinked" rule, enforced by the DB schema itself rather than a pre-check here. Its own terms cascade-delete with it. */
export async function deleteAcademicYear(id: string): Promise<void> {
  const { error } = await supabase.from('academic_years').delete().eq('id', id);
  if (error) throw error;
}

/** Backs the Delete icon's visibility, not the delete itself — see academic_year_can_delete (20260915020000_academic_year_term_can_delete.sql). */
export async function canDeleteAcademicYear(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('academic_year_can_delete', { p_academic_year_id: id });
  if (error) throw error;
  return data ?? false;
}

export async function updateTerm(id: string, input: { name: string; sequence: number; startsOn: string; endsOn: string }): Promise<void> {
  const { error } = await supabase
    .from('terms')
    .update({ name: input.name, sequence: input.sequence, starts_on: input.startsOn, ends_on: input.endsOn })
    .eq('id', id);
  if (error) throw error;
}

/** Fails with a foreign key violation (Postgres code 23503) while any mark sheet or attendance summary still references this term — that's the "only when unlinked" rule, enforced by the DB schema itself rather than a pre-check here. */
export async function deleteTerm(id: string): Promise<void> {
  const { error } = await supabase.from('terms').delete().eq('id', id);
  if (error) throw error;
}

/** Backs the Delete icon's visibility, not the delete itself — see term_can_delete (20260915020000_academic_year_term_can_delete.sql). */
export async function canDeleteTerm(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('term_can_delete', { p_term_id: id });
  if (error) throw error;
  return data ?? false;
}

/** FR-CAL-03: "the principal sets the weekly working-day pattern for the school." ISO weekdays, 1 = Monday. */
export async function updateWorkingWeekdays(weekdays: number[]): Promise<void> {
  const { error } = await supabase.from('school_settings').update({ working_weekdays: weekdays }).eq('id', true);
  if (error) throw error;
}

export async function fetchWorkingWeekdays(): Promise<number[]> {
  const { data, error } = await supabase.from('school_settings').select('working_weekdays').maybeSingle();
  if (error) throw error;
  return data?.working_weekdays ?? [1, 2, 3, 4, 5];
}

export type CalendarDayType = 'school' | 'holiday' | 'half_day' | 'exam' | 'closure';

export async function fetchCalendarDay(onDate: string): Promise<{ dayType: CalendarDayType; label: string | null } | null> {
  const { data, error } = await supabase.from('calendar_days').select('day_type, label').eq('on_date', onDate).maybeSingle();
  if (error) throw error;
  return data ? { dayType: data.day_type as CalendarDayType, label: data.label } : null;
}

export async function setCalendarDay(onDate: string, dayType: CalendarDayType, label: string | undefined, createdBy: string): Promise<void> {
  const { error } = await supabase.from('calendar_days').upsert(
    { on_date: onDate, day_type: dayType, label: label || null, created_by: createdBy },
    { onConflict: 'on_date' },
  );
  if (error) throw error;
}

export type CalendarDayEntry = { onDate: string; dayType: CalendarDayType; label: string | null };

/** Every explicit calendar_days row (holidays, closures, half days, exams) in a date range — used to mark a date picker with the academic calendar rather than fetching is_school_day() one date at a time. Days with no row here fall back to the working-weekday/term rule (see useWorkingWeekdays/useCurrentYearTerms and is_school_day() in 20260907100003_is_school_day.sql). */
export async function listCalendarDaysInRange(startIso: string, endIso: string): Promise<CalendarDayEntry[]> {
  const { data, error } = await supabase.from('calendar_days').select('on_date, day_type, label').gte('on_date', startIso).lte('on_date', endIso);
  if (error) throw error;
  return (data ?? []).map((r) => ({ onDate: r.on_date, dayType: r.day_type as CalendarDayType, label: r.label }));
}

/** FR-CAL-06: cancels the day's attendance obligations, excludes it from summaries, and notifies all staff — all server-side (declare_closure()). */
export async function declareClosure(onDate: string, label?: string): Promise<void> {
  const { error } = await supabase.rpc('declare_closure', { p_date: onDate, p_label: label || null });
  if (error) throw error;
}

/** Every explicit calendar_days row, across every date — backs the "edited days" list on AcademicCalendarScreen so the principal can review, re-open, or remove any override in one place instead of having to already know a date to look it up. */
export async function listAllCalendarDays(): Promise<CalendarDayEntry[]> {
  const { data, error } = await supabase.from('calendar_days').select('on_date, day_type, label').order('on_date');
  if (error) throw error;
  return (data ?? []).map((r) => ({ onDate: r.on_date, dayType: r.day_type as CalendarDayType, label: r.label }));
}

/**
 * Removes an explicit override so the date reverts to whatever the term/working-weekday
 * defaults say — different from setting its type back to 'school', which instead forces a
 * school day regardless of those defaults (see is_school_day() in 20260907100003_is_school_day.sql).
 */
export async function deleteCalendarDay(onDate: string): Promise<void> {
  const { error } = await supabase.from('calendar_days').delete().eq('on_date', onDate);
  if (error) throw error;
}
