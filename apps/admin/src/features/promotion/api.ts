import { listAcademicYears, addAcademicYear, type AcademicYear } from '@/features/calendar/api';
import { listGrades, listClassesForCurrentYear, listClassesForYear, ensureClassForYear, type Grade, type ClassRow } from '@/features/academicStructure/api';
import { listStudentsInClasses, promoteStudents as promoteStudentsRpc, type StudentSummary, type PromotionResult } from '@/features/students/api';

export type { AcademicYear, Grade, ClassRow, PromotionResult };

export type RosterStudent = StudentSummary & { rollNo: string | null };

export type SourceClass = ClassRow & { studentCount: number };

/** A resolved destination for a class (the default) or an individual student (an override). */
export type ClassDestination =
  | { kind: 'promote'; targetGradeId: string; targetGradeNumber: number; targetClassName: string }
  | { kind: 'graduate' };

export type PromotionPlan = {
  currentYear: AcademicYear;
  sourceClasses: SourceClass[];
  grades: Grade[];
  studentsByClass: Map<string, RosterStudent[]>;
  /** grade id -> the next grade up, or null when it's the highest grade (graduating). */
  nextGradeByGradeId: Map<string, Grade | null>;
};

/**
 * Loads everything the promotion screen needs about the *current* year:
 * every class, its roster, and grade order (so "next grade" is derivable).
 * Nothing here touches the target year — that's chosen separately, since
 * it may not exist yet.
 */
export async function loadPromotionPlan(): Promise<PromotionPlan> {
  const [years, grades, sourceClassesRaw] = await Promise.all([listAcademicYears(), listGrades(), listClassesForCurrentYear()]);
  const currentYear = years.find((y) => y.isCurrent);
  if (!currentYear) throw new Error('No current academic year is set.');

  const sortedGrades = [...grades].sort((a, b) => a.number - b.number);
  const nextGradeByGradeId = new Map<string, Grade | null>();
  sortedGrades.forEach((g, i) => nextGradeByGradeId.set(g.id, sortedGrades[i + 1] ?? null));

  const classIds = sourceClassesRaw.map((c) => c.id);
  const roster = classIds.length > 0 ? await listStudentsInClasses(classIds) : [];
  const studentsByClass = new Map<string, RosterStudent[]>();
  for (const s of roster) {
    const list = studentsByClass.get(s.classId) ?? [];
    list.push(s);
    studentsByClass.set(s.classId, list);
  }

  const sourceClasses: SourceClass[] = sourceClassesRaw
    .map((c) => ({ ...c, studentCount: (studentsByClass.get(c.id) ?? []).length }))
    .sort((a, b) => a.gradeNumber - b.gradeNumber || a.name.localeCompare(b.name));

  return { currentYear, sourceClasses, grades: sortedGrades, studentsByClass, nextGradeByGradeId };
}

export async function listOtherAcademicYears(excludeId: string): Promise<AcademicYear[]> {
  const years = await listAcademicYears();
  return years.filter((y) => y.id !== excludeId).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}

/** Creates a new academic year and returns it — addAcademicYear() itself only inserts, so the new row is looked up by its (unique) label right after. */
export async function createAcademicYear(input: { label: string; startsOn: string; endsOn: string }): Promise<AcademicYear> {
  await addAcademicYear(input);
  const years = await listAcademicYears();
  const created = years.find((y) => y.label === input.label);
  if (!created) throw new Error('Could not find the academic year just created.');
  return created;
}

export { listClassesForYear };

/**
 * "1A" in grade 1 -> next grade 2 => "2A": strips the class name's own
 * grade-number prefix and re-applies the target grade's number. Falls back
 * to the unchanged name when the class name doesn't start with its source
 * grade's number (an admin naming a class something else entirely) — just
 * a starting suggestion, always overridable in the mapping screen.
 */
export function suggestDestinationName(sourceClassName: string, sourceGradeNumber: number, targetGradeNumber: number): string {
  const match = sourceClassName.match(/^(\d+)(.*)$/);
  if (match && Number(match[1]) === sourceGradeNumber) {
    return `${targetGradeNumber}${match[2]}`;
  }
  return sourceClassName;
}

export function defaultDestinationsFor(plan: PromotionPlan): Map<string, ClassDestination> {
  const defaults = new Map<string, ClassDestination>();
  for (const cls of plan.sourceClasses) {
    const nextGrade = plan.nextGradeByGradeId.get(cls.gradeId);
    if (!nextGrade) {
      defaults.set(cls.id, { kind: 'graduate' });
    } else {
      defaults.set(cls.id, {
        kind: 'promote',
        targetGradeId: nextGrade.id,
        targetGradeNumber: nextGrade.number,
        targetClassName: suggestDestinationName(cls.name, cls.gradeNumber, nextGrade.number),
      });
    }
  }
  return defaults;
}

/**
 * Applies the resolved mapping: creates any destination class that doesn't
 * exist yet in the target year, then writes every promotion/graduation in
 * one call to promote_students(). classDestinations gives each source
 * class's default; studentOverrides (keyed by student id) wins over it for
 * the students it names — this is how per-class overrides and per-student
 * exceptions (including "repeat this grade") end up as the same shape.
 */
export async function runPromotion(input: {
  targetYearId: string;
  sourceClasses: SourceClass[];
  classDestinations: Map<string, ClassDestination>;
  studentOverrides: Map<string, ClassDestination>;
  studentsByClass: Map<string, RosterStudent[]>;
}): Promise<PromotionResult> {
  const resolvedClassIds = new Map<string, string>(); // `${gradeId}::${name}` -> classId

  async function resolveClassId(dest: { targetGradeId: string; targetClassName: string }): Promise<string> {
    const key = `${dest.targetGradeId}::${dest.targetClassName}`;
    const cached = resolvedClassIds.get(key);
    if (cached) return cached;
    const id = await ensureClassForYear({ academicYearId: input.targetYearId, gradeId: dest.targetGradeId, name: dest.targetClassName });
    resolvedClassIds.set(key, id);
    return id;
  }

  const promotions: { studentId: string; classId: string }[] = [];
  const graduatingStudentIds: string[] = [];

  for (const cls of input.sourceClasses) {
    const classDest = input.classDestinations.get(cls.id);
    if (!classDest) continue;
    const students = input.studentsByClass.get(cls.id) ?? [];
    for (const student of students) {
      const dest = input.studentOverrides.get(student.id) ?? classDest;
      if (dest.kind === 'graduate') {
        graduatingStudentIds.push(student.id);
      } else {
        const classId = await resolveClassId(dest);
        promotions.push({ studentId: student.id, classId });
      }
    }
  }

  return promoteStudentsRpc({ targetYearId: input.targetYearId, promotions, graduatingStudentIds });
}
