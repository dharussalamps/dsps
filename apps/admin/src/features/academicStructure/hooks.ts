import { useQuery } from '@tanstack/react-query';
import { listClassSubjectTeachers, listClassesForCurrentYear, listGrades, listSubjects } from './api';

export function useGrades() {
  return useQuery({ queryKey: ['academicStructure', 'grades'], queryFn: listGrades });
}

export function useSubjects() {
  return useQuery({ queryKey: ['academicStructure', 'subjects'], queryFn: listSubjects });
}

export function useClassesForCurrentYear() {
  return useQuery({ queryKey: ['academicStructure', 'classes'], queryFn: listClassesForCurrentYear });
}

export function useClassSubjectTeachers() {
  return useQuery({ queryKey: ['academicStructure', 'class-subject-teachers'], queryFn: () => listClassSubjectTeachers() });
}
