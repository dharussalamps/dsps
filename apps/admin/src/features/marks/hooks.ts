import { useQuery } from '@tanstack/react-query';
import { fetchClassSubjectAverage, fetchCurrentTerm, fetchStudentMarks, listSubjectsForClass, listVisibleMarkSheets } from './api';

export function useSubjectsForClass(classId: string) {
  return useQuery({ queryKey: ['marks', 'subjects', classId], queryFn: () => listSubjectsForClass(classId) });
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
