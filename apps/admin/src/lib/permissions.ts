/**
 * Client-side mirror of has_permission() (AdminSpec.md section 5.3).
 *
 * This is presentation only — it decides whether to show or hide a
 * control. The server enforces the real rule via RLS and has_permission()
 * on every read and write; removing this file would only make the UI show
 * controls that the server then rejects, never the other way round.
 */

export type ScopeType = 'school' | 'grade' | 'class' | 'self';

export type PermissionGrant = {
  permissionKey: string;
  scopeType: ScopeType;
  /** grades.id for scope 'grade', classes.id for scope 'class', null otherwise. */
  scopeId: string | null;
};

export type CoverGrant = {
  classId: string;
  startsOn: string; // ISO date
  endsOn: string; // ISO date
};

export type PermissionContext = {
  classId?: string;
  gradeId?: string;
  /** Today's date as an ISO string (yyyy-MM-dd). Defaults to the device clock. */
  today?: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function withinCover(cover: CoverGrant, today: string): boolean {
  return cover.startsOn <= today && today <= cover.endsOn;
}

/**
 * Mirrors has_permission(p_staff_id, p_permission, p_class_id): true if any
 * direct grant covers the permission at a scope containing the record, or
 * an active cover assignment for p_class_id grants class-teacher rights
 * that include this permission.
 */
export function hasPermission(
  grants: PermissionGrant[],
  permissionKey: string,
  context: PermissionContext = {},
  options: { coverGrants?: CoverGrant[]; classTeacherPermissionKeys?: string[] } = {},
): boolean {
  const direct = grants.some((g) => {
    if (g.permissionKey !== permissionKey) return false;
    switch (g.scopeType) {
      case 'school':
      case 'self':
        return true;
      case 'grade':
        return context.gradeId != null && context.gradeId === g.scopeId;
      case 'class':
        return context.classId != null && context.classId === g.scopeId;
      default:
        return false;
    }
  });
  if (direct) return true;

  const { coverGrants, classTeacherPermissionKeys } = options;
  if (!coverGrants?.length || !classTeacherPermissionKeys?.length || !context.classId) return false;
  if (!classTeacherPermissionKeys.includes(permissionKey)) return false;

  const today = context.today ?? todayIso();
  return coverGrants.some((c) => c.classId === context.classId && withinCover(c, today));
}
