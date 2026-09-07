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
