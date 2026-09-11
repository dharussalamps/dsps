import { useQuery } from '@tanstack/react-query';
import {
  fetchClassSubjectAverage,
  fetchCurrentTerm,
  fetchMarkEntryContext,
  fetchOutstandingMarkSheets,
  fetchStudentMarks,
  fetchStudentTermPosition,
  fetchStudentTermTrend,
  listSubjectsForClass,
  listSubjectsForTeacherInClass,
  listVisibleMarkSheets,
} from './api';

export function useMarkEntryContext(classId: string, subjectId: string, termId: string) {
  return useQuery({
    queryKey: ['marks', 'entry-context', classId, subjectId, termId],
    queryFn: () => fetchMarkEntryContext(classId, subjectId, termId),
  });
}

export function useSubjectsForClass(classId: string) {
  return useQuery({ queryKey: ['marks', 'subjects', classId], queryFn: () => listSubjectsForClass(classId) });
}

export function useSubjectsForTeacherInClass(classId: string, staffId: string | undefined) {
  return useQuery({
    queryKey: ['marks', 'subjects-for-teacher', classId, staffId],
    queryFn: () => listSubjectsForTeacherInClass(classId, staffId as string),
    enabled: !!staffId,
  });
}

export function useCurrentTerm() {
  return useQuery({ queryKey: ['marks', 'current-term'], queryFn: fetchCurrentTerm, staleTime: 60 * 60_000 });
}

export function useStudentMarks(studentId: string | undefined) {
  return useQuery({
    queryKey: ['marks', 'student', studentId],
    queryFn: () => fetchStudentMarks(studentId as string),
    enabled: !!studentId,
  });
}

export function useVisibleMarkSheets() {
  return useQuery({ queryKey: ['marks', 'visible-sheets'], queryFn: listVisibleMarkSheets });
}

export function useClassSubjectAverage(classId: string, subjectId: string, termId: string) {
  return useQuery({
    queryKey: ['marks', 'class-average', classId, subjectId, termId],
    queryFn: () => fetchClassSubjectAverage(classId, subjectId, termId),
  });
}

export function useStudentTermPosition(studentId: string | undefined, termId: string | undefined) {
  return useQuery({
    queryKey: ['marks', 'term-position', studentId, termId],
    queryFn: () => fetchStudentTermPosition(studentId as string, termId as string),
    enabled: !!studentId && !!termId,
  });
}

export function useStudentTermTrend(studentId: string | undefined) {
  return useQuery({
    queryKey: ['marks', 'term-trend', studentId],
    queryFn: () => fetchStudentTermTrend(studentId as string),
    enabled: !!studentId,
  });
}

export function useOutstandingMarkSheets(termId?: string) {
  return useQuery({
    queryKey: ['marks', 'outstanding', termId],
    queryFn: () => fetchOutstandingMarkSheets(termId),
  });
}
