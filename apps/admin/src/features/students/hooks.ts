import { useQuery } from '@tanstack/react-query';
import {
  fetchAchievements,
  fetchBenefits,
  fetchMemberships,
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

export function useAchievements(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'achievements', studentId],
    queryFn: () => fetchAchievements(studentId as string),
    enabled: !!studentId,
  });
}

export function useMemberships(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'memberships', studentId],
    queryFn: () => fetchMemberships(studentId as string),
    enabled: !!studentId,
  });
}

export function useBenefits(studentId: string | undefined) {
  return useQuery({
    queryKey: ['students', 'benefits', studentId],
    queryFn: () => fetchBenefits(studentId as string),
    enabled: !!studentId,
  });
}
