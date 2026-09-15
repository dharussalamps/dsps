import type { IconName } from '@/components';

/**
 * Registry of every toggleable Home screen widget, backing both HomeScreen
 * (which cards to render) and DashboardWidgetsScreen (the enable/disable
 * list under Settings). A staff member's actual visibility is this
 * registry's `defaultEnabled` overridden by their own
 * staff_dashboard_prefs.widget_overrides row — see widgetPrefs.ts.
 */
export type WidgetId =
  | 'schoolMission'
  | 'myClassAttendance'
  | 'unmarkedClasses'
  | 'schoolPulse'
  | 'needsAttention'
  | 'today'
  | 'quickActions'
  | 'academicPerformance'
  | 'birthdays'
  | 'announcementsFeed'
  | 'notificationsDigest'
  | 'weekEvents'
  | 'earlyLeaveLog'
  | 'outstandingMarkSheetsList'
  | 'coverAssignments'
  | 'staffAttendanceDetail'
  | 'enrollmentSnapshot'
  | 'calendarOverview'
  | 'auditActivity'
  | 'newThisTerm';

/** Groups the toggle list on DashboardWidgetsScreen — purely presentational, doesn't affect HomeScreen. */
export type WidgetCategory = 'core' | 'academic' | 'attendance' | 'calendar' | 'activity';

export type WidgetDefinition = {
  id: WidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Icon shown on its DashboardWidgetsScreen row — matches the icon the widget's own Home card uses. */
  icon: IconName;
  category: WidgetCategory;
};

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    id: 'schoolMission',
    label: 'School mission',
    description: "The school's logo and mission statement.",
    defaultEnabled: true,
    icon: 'ribbon-outline',
    category: 'core',
  },
  {
    id: 'myClassAttendance',
    label: 'My class attendance',
    description: "Mark today's attendance for classes you teach or cover.",
    defaultEnabled: true,
    icon: 'clipboard-outline',
    category: 'core',
  },
  {
    id: 'unmarkedClasses',
    label: 'Unmarked classes',
    description: 'Alert and reminder button for classes not yet marked today.',
    defaultEnabled: true,
    icon: 'time-outline',
    category: 'core',
  },
  {
    id: 'schoolPulse',
    label: 'School pulse',
    description: 'Staff present today, pending approvals, and who is on leave.',
    defaultEnabled: true,
    icon: 'pulse-outline',
    category: 'core',
  },
  {
    id: 'needsAttention',
    label: 'Needs attention',
    description: 'Leave requests, uncovered classes, at-risk students, outstanding mark sheets, low stock.',
    defaultEnabled: true,
    icon: 'alert-circle-outline',
    category: 'core',
  },
  {
    id: 'today',
    label: 'Today',
    description: "Your duties and today's events.",
    defaultEnabled: true,
    icon: 'today-outline',
    category: 'core',
  },
  {
    id: 'quickActions',
    label: 'Quick actions',
    description: 'Announce, find a student, declare a closure, audit log.',
    defaultEnabled: true,
    icon: 'flash-outline',
    category: 'core',
  },
  {
    id: 'academicPerformance',
    label: 'Academic performance',
    description: 'Current-term average score and students needing academic attention.',
    defaultEnabled: false,
    icon: 'school-outline',
    category: 'academic',
  },
  {
    id: 'outstandingMarkSheetsList',
    label: 'Outstanding mark sheets (list)',
    description: 'The actual list of mark sheets awaiting entry, not just a count.',
    defaultEnabled: false,
    icon: 'document-text-outline',
    category: 'academic',
  },
  {
    id: 'enrollmentSnapshot',
    label: 'Student enrolment',
    description: 'Total active students and the per-grade breakdown this year.',
    defaultEnabled: false,
    icon: 'people-circle-outline',
    category: 'academic',
  },
  {
    id: 'newThisTerm',
    label: 'New this term',
    description: 'Students and staff added since the current term started.',
    defaultEnabled: false,
    icon: 'sparkles-outline',
    category: 'academic',
  },
  {
    id: 'earlyLeaveLog',
    label: 'Early leaves today',
    description: "Students who left early today, across every class you can see.",
    defaultEnabled: false,
    icon: 'exit-outline',
    category: 'attendance',
  },
  {
    id: 'staffAttendanceDetail',
    label: 'Staff attendance detail',
    description: "Today's full staff present/absent/on-leave list, not just the ratio.",
    defaultEnabled: false,
    icon: 'people-outline',
    category: 'attendance',
  },
  {
    id: 'coverAssignments',
    label: 'Cover assignments',
    description: 'Cover teacher assignments active today or starting within a week.',
    defaultEnabled: false,
    icon: 'swap-horizontal-outline',
    category: 'attendance',
  },
  {
    id: 'weekEvents',
    label: "This week's events",
    description: 'Events over the next 7 days, not just today.',
    defaultEnabled: false,
    icon: 'calendar-outline',
    category: 'calendar',
  },
  {
    id: 'calendarOverview',
    label: 'Calendar overview',
    description: 'Upcoming holidays/closures in the next 30 days and the current term end date.',
    defaultEnabled: false,
    icon: 'calendar-clear-outline',
    category: 'calendar',
  },
  {
    id: 'birthdays',
    label: "Today's birthdays",
    description: 'Students and staff with a birthday today.',
    defaultEnabled: false,
    icon: 'gift-outline',
    category: 'calendar',
  },
  {
    id: 'announcementsFeed',
    label: 'Recent announcements',
    description: 'The last few announcements and whether you’ve read them.',
    defaultEnabled: false,
    icon: 'megaphone-outline',
    category: 'activity',
  },
  {
    id: 'notificationsDigest',
    label: 'Notifications digest',
    description: 'Your most recent system notifications, not just the unread badge.',
    defaultEnabled: false,
    icon: 'mail-unread-outline',
    category: 'activity',
  },
  {
    id: 'auditActivity',
    label: 'Recent audit activity',
    description: 'The last few audit log entries — new accounts, permission changes, and more.',
    defaultEnabled: false,
    icon: 'shield-checkmark-outline',
    category: 'activity',
  },
];
