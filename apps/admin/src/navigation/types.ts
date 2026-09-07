import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Every route in AdminSpec.md section 10. Screens not yet built (see
 * docs/AdminSpec.md section 17 for status) render <PlaceholderScreen /> —
 * registering the full route table now means the navigation shell and IA
 * never need to change shape as each screen is filled in.
 */
export type TabParamList = {
  Home: undefined;
  StudentSearch: undefined;
  AttendanceBoard: undefined;
  Announcements: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;

  ClassList: undefined;
  ClassDetail: { classId: string };
  StudentProfile: { studentId: string };

  MarkAttendance: { classId: string };
  AttendanceSubmitted: { classId: string; onDate: string };
  EarlyLeave: { classId: string };

  MarkEntry: { classId: string; subjectId: string; termId: string };
  MarksReview: undefined;

  StaffDirectory: undefined;
  StaffProfile: { staffId: string };

  MyLeave: undefined;
  LeaveRequests: undefined;
  LeaveRequestDetail: { requestId: string };

  ComposeAnnouncement: undefined;

  Inventory: undefined;
  InventoryItem: { itemId: string };

  EventCalendar: undefined;
  EventDetail: { eventId: string };
  Diary: undefined;

  AcademicCalendar: undefined;
  CalendarDayEditor: { date: string };

  Analytics: undefined;
  UserAccounts: undefined;
  AuditLog: undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
};
// SetPassword is not a navigable route: RootNavigator renders it directly
// while auth status is 'needsPasswordSet' (see src/store/authStore.ts),
// matching its gate in section 10 ("authenticated, first login").

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- React Navigation's documented pattern for global route typing.
    interface RootParamList extends RootStackParamList {}
  }
}
