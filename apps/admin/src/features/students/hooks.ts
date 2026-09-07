import { useQuery } from '@tanstack/react-query';
import {
  getStudentGuardians,
  getStudentProfile,
  listClasses,
  listStudentsInClass,
  searchStudents,
} from './api';

export function useStudentSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['students', 'search', term],
    queryFn: () => searchStudents(term),
    enabled: term.length >= 2,
  });
}

export function useClasses() {
  return useQuery({ queryKey: ['classes', 'current-year'], queryFn: listClasses });
}

export function useStudentsInClass(classId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'by-class', classId],
    queryFn: () => listStudentsInClass(classId as string),
    enabled: !!classId,
  });
}

export function useStudentProfile(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'profile', studentId],
    queryFn: () => getStudentProfile(studentId as string),
    enabled: !!studentId,
  });
}

export function useStudentGuardians(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'guardians', studentId],
    queryFn: () => getStudentGuardians(studentId as string),
    enabled: !!studentId,
  });
}
