import { useQuery } from '@tanstack/react-query';
import {
  fetchAchievements,
  fetchBenefits,
  fetchMemberships,
  getStudentGuardians,
  getStudentProfile,
  listClasses,
  listStudentsInClass,
  listStudentsInClasses,
  listUnassignedStudents,
  searchEnrolledStudents,
  searchStudents,
} from './api';

export function useStudentSearch(query: string, classIds?: string[]) {
  const term = query.trim();
  const key = classIds && classIds.length > 0 ? [...classIds].sort() : null;
  return useQuery({
    queryKey: ['students', 'search', term, key],
    queryFn: () => searchStudents(term, classIds),
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

/** For a browse-by-grade filter: the merged roster of every class in `classIds`. */
export function useStudentsInClasses(classIds: string[] | undefined) {
  const key = classIds && classIds.length > 0 ? [...classIds].sort() : null;
  return useQuery({
    queryKey: ['students', 'by-classes', key],
    queryFn: () => listStudentsInClasses(classIds as string[]),
    enabled: !!classIds && classIds.length > 0,
  });
}

export function useUnassignedStudents() {
  return useQuery({ queryKey: ['students', 'unassigned'], queryFn: listUnassignedStudents });
}

export function useEnrolledStudentSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['students', 'search-enrolled', term],
    queryFn: () => searchEnrolledStudents(term),
    enabled: term.length >= 2,
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
