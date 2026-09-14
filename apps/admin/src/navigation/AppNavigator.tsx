import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AcademicStructureScreen } from '@/features/academicStructure/AcademicStructureScreen';
import { AnnouncementsScreen } from '@/features/announcements/AnnouncementsScreen';
import { ComposeAnnouncementScreen } from '@/features/announcements/ComposeAnnouncementScreen';
import { NotificationsScreen } from '@/features/notifications/NotificationsScreen';
import { AssignCoverScreen } from '@/features/leave/AssignCoverScreen';
import { AttendanceSubmittedScreen } from '@/features/attendance/AttendanceSubmittedScreen';
import { MarkAttendanceScreen } from '@/features/attendance/MarkAttendanceScreen';
import { MarkStaffAttendanceScreen } from '@/features/attendance/MarkStaffAttendanceScreen';
import { AuditLogScreen } from '@/features/accounts/AuditLogScreen';
import { UserAccountsScreen } from '@/features/accounts/UserAccountsScreen';
import { AnalyticsScreen } from '@/features/analytics/AnalyticsScreen';
import { AcademicCalendarScreen } from '@/features/calendar/AcademicCalendarScreen';
import { CalendarDayEditorScreen } from '@/features/calendar/CalendarDayEditorScreen';
import { EarlyLeaveScreen } from '@/features/earlyLeave/EarlyLeaveScreen';
import { DiaryScreen } from '@/features/events/DiaryScreen';
import { EventCalendarScreen } from '@/features/events/EventCalendarScreen';
import { EventDetailScreen } from '@/features/events/EventDetailScreen';
import { InventoryItemScreen } from '@/features/inventory/InventoryItemScreen';
import { InventoryScreen } from '@/features/inventory/InventoryScreen';
import { LeaveAllocationScreen } from '@/features/leave/LeaveAllocationScreen';
import { LeaveRequestDetailScreen } from '@/features/leave/LeaveRequestDetailScreen';
import { LeaveRequestsScreen } from '@/features/leave/LeaveRequestsScreen';
import { MyLeaveScreen } from '@/features/leave/MyLeaveScreen';
import { MarkEntryScreen } from '@/features/marks/MarkEntryScreen';
import { MarksReviewScreen } from '@/features/marks/MarksReviewScreen';
import { ExamsScreen } from '@/features/exams/ExamsScreen';
import { ExamMarksScreen } from '@/features/exams/ExamMarksScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { AddStudentScreen } from '@/features/students/AddStudentScreen';
import { ClassDetailScreen } from '@/features/students/ClassDetailScreen';
import { ClassListScreen } from '@/features/students/ClassListScreen';
import { SetClassScreen } from '@/features/students/SetClassScreen';
import { StudentProfileScreen } from '@/features/students/StudentProfileScreen';
import { StaffDirectoryScreen } from '@/features/staff/StaffDirectoryScreen';
import { StaffProfileScreen } from '@/features/staff/StaffProfileScreen';
import { TabsNavigator } from './TabsNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Every screen in AdminSpec.md section 10 has a real component as of
 * build task 22 — see docs/AdminSpec.md section 17 for what each task
 * actually covers vs. still-open scope within a screen (e.g. permission-
 * filtered visibility). Registered explicitly (rather than looped from an
 * array) so each screen keeps its own typed route params.
 *
 * The native header is off everywhere: every screen renders its own themed
 * Hero + ScreenHeader (with a back chevron via `back`), so there's a single
 * consistent header instead of stacking a plain native title bar underneath
 * the app's own one.
 */
export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />

      <Stack.Screen name="ClassList" component={ClassListScreen} />
      <Stack.Screen name="ClassDetail" component={ClassDetailScreen} />
      <Stack.Screen name="StudentProfile" component={StudentProfileScreen} />
      <Stack.Screen name="AddStudent" component={AddStudentScreen} />
      <Stack.Screen name="SetClass" component={SetClassScreen} />

      <Stack.Screen name="MarkAttendance" component={MarkAttendanceScreen} />
      <Stack.Screen name="MarkStaffAttendance" component={MarkStaffAttendanceScreen} />
      <Stack.Screen name="AttendanceSubmitted" component={AttendanceSubmittedScreen} />
      <Stack.Screen name="EarlyLeave" component={EarlyLeaveScreen} />

      <Stack.Screen name="MarkEntry" component={MarkEntryScreen} />
      <Stack.Screen name="MarksReview" component={MarksReviewScreen} />
      <Stack.Screen name="Exams" component={ExamsScreen} />
      <Stack.Screen name="ExamMarks" component={ExamMarksScreen} />

      <Stack.Screen name="StaffDirectory" component={StaffDirectoryScreen} />
      <Stack.Screen name="StaffProfile" component={StaffProfileScreen} />

      <Stack.Screen name="MyLeave" component={MyLeaveScreen} />
      <Stack.Screen name="LeaveRequests" component={LeaveRequestsScreen} />
      <Stack.Screen name="LeaveRequestDetail" component={LeaveRequestDetailScreen} />
      <Stack.Screen name="LeaveAllocation" component={LeaveAllocationScreen} />

      <Stack.Screen name="Announcements" component={AnnouncementsScreen} />
      <Stack.Screen name="ComposeAnnouncement" component={ComposeAnnouncementScreen} />

      <Stack.Screen name="Inventory" component={InventoryScreen} />
      <Stack.Screen name="InventoryItem" component={InventoryItemScreen} />

      <Stack.Screen name="EventCalendar" component={EventCalendarScreen} />
      <Stack.Screen name="EventDetail" component={EventDetailScreen} />
      <Stack.Screen name="Diary" component={DiaryScreen} />

      <Stack.Screen name="AcademicCalendar" component={AcademicCalendarScreen} />
      <Stack.Screen name="CalendarDayEditor" component={CalendarDayEditorScreen} />
      <Stack.Screen name="AcademicStructure" component={AcademicStructureScreen} />

      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="UserAccounts" component={UserAccountsScreen} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="AssignCover" component={AssignCoverScreen} />
    </Stack.Navigator>
  );
}
