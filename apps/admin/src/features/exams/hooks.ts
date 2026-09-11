import { useQuery } from '@tanstack/react-query';
import { fetchMarksForSheet } from '@/features/marks/api';
import { countRosterForClass, fetchExamDetail, listClassesForYear, listExamsForClass } from './api';

export function useClassesForYear(academicYearId: string | undefined) {
  return useQuery({
    queryKey: ['exams', 'classes', academicYearId],
    queryFn: () => listClassesForYear(academicYearId as string),
    enabled: !!academicYearId,
  });
}

export function useExamsForClass(classId: string | undefined) {
  return useQuery({
    queryKey: ['exams', 'sheets', classId],
    queryFn: () => listExamsForClass(classId as string),
    enabled: !!classId,
  });
}

export function useExamDetail(markSheetId: string | undefined) {
  return useQuery({
    queryKey: ['exams', 'detail', markSheetId],
    queryFn: () => fetchExamDetail(markSheetId as string),
    enabled: !!markSheetId,
  });
}

export function useClassRosterCount(classId: string | undefined) {
  return useQuery({
    queryKey: ['exams', 'roster-count', classId],
    queryFn: () => countRosterForClass(classId as string),
    enabled: !!classId,
  });
}

export function useExamMarks(markSheetId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: ['exams', 'marks', markSheetId],
    queryFn: () => fetchMarksForSheet(markSheetId as string, classId as string),
    enabled: !!markSheetId && !!classId,
  });
}
