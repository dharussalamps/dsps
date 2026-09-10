import type { NavigatorScreenParams } from '@react-navigation/native';

/** Every route in AdminSpec.md section 10; see docs/AdminSpec.md section 17 for what each screen actually covers. */
export type TabParamList = {
  Home: undefined;
  StudentSearch: undefined;
  AttendanceBoard: undefined;
  /** Principals see StaffTab here instead — see TabsNavigator's useIsPrincipal branch. */
  Announcements: undefined;
  StaffTab: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;

  ClassList: undefined;
  ClassDetail: { classId: string };
  StudentProfile: { studentId: string };

  MarkAttendance: { classId: string };
  MarkStaffAttendance: undefined;
  AttendanceSubmitted: {
    classId: string;
    onDate: string;
    /** Instant local echo shown before the server-confirmed list (with consecutive-day counts) arrives — see MarkAttendanceScreen. */
    localAbsentees?: { studentId: string; fullName: string }[];
  };
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
  AcademicStructure: undefined;

  Analytics: undefined;
  UserAccounts: undefined;
  AuditLog: undefined;
  Settings: undefined;
  Notifications: undefined;
  AssignCover: { classId?: string } | undefined;
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
