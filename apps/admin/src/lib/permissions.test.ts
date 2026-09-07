import { describe, expect, it } from 'vitest';
import { hasPermission, type PermissionGrant } from './permissions';

const GRADE_A = 'grade-1';
const GRADE_B = 'grade-2';
const CLASS_A = 'class-1a';
const CLASS_B = 'class-1b'; // same grade as CLASS_A
const CLASS_C = 'class-2a'; // different grade

describe('hasPermission (mirrors has_permission() in Postgres)', () => {
  it('grants a school-scope permission for any class', () => {
    const grants: PermissionGrant[] = [{ permissionKey: 'attendance.view_board', scopeType: 'school', scopeId: null }];
    expect(hasPermission(grants, 'attendance.view_board', { classId: CLASS_A })).toBe(true);
    expect(hasPermission(grants, 'attendance.view_board', { classId: CLASS_C })).toBe(true);
  });

  it('grants a grade-scope permission only within that grade', () => {
    const grants: PermissionGrant[] = [{ permissionKey: 'student.view_full', scopeType: 'grade', scopeId: GRADE_A }];
    expect(hasPermission(grants, 'student.view_full', { classId: CLASS_B, gradeId: GRADE_A })).toBe(true);
    expect(hasPermission(grants, 'student.view_full', { classId: CLASS_C, gradeId: GRADE_B })).toBe(false);
  });

  it('grants a class-scope permission only for that exact class', () => {
    const grants: PermissionGrant[] = [{ permissionKey: 'attendance.mark', scopeType: 'class', scopeId: CLASS_A }];
    expect(hasPermission(grants, 'attendance.mark', { classId: CLASS_A })).toBe(true);
    expect(hasPermission(grants, 'attendance.mark', { classId: CLASS_B })).toBe(false);
  });

  it('denies a permission the grant list does not contain', () => {
    const grants: PermissionGrant[] = [{ permissionKey: 'attendance.mark', scopeType: 'school', scopeId: null }];
    expect(hasPermission(grants, 'account.manage', { classId: CLASS_A })).toBe(false);
  });

  it('grants class-teacher permissions for a class under an active cover assignment', () => {
    const result = hasPermission(
      [],
      'attendance.mark',
      { classId: CLASS_A, today: '2026-09-07' },
      {
        coverGrants: [{ classId: CLASS_A, startsOn: '2026-09-05', endsOn: '2026-09-09' }],
        classTeacherPermissionKeys: ['attendance.mark', 'attendance.view_board'],
      },
    );
    expect(result).toBe(true);
  });

  it('denies cover-based access once the assignment has ended', () => {
    const result = hasPermission(
      [],
      'attendance.mark',
      { classId: CLASS_A, today: '2026-09-10' },
      {
        coverGrants: [{ classId: CLASS_A, startsOn: '2026-09-05', endsOn: '2026-09-09' }],
        classTeacherPermissionKeys: ['attendance.mark'],
      },
    );
    expect(result).toBe(false);
  });

  it('denies cover-based access for a permission class_teacher does not hold', () => {
    const result = hasPermission(
      [],
      'account.manage',
      { classId: CLASS_A, today: '2026-09-07' },
      {
        coverGrants: [{ classId: CLASS_A, startsOn: '2026-09-05', endsOn: '2026-09-09' }],
        classTeacherPermissionKeys: ['attendance.mark'],
      },
    );
    expect(result).toBe(false);
  });
});
