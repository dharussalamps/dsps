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
