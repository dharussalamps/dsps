import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ComposeAnnouncementScreen } from '@/features/announcements/ComposeAnnouncementScreen';
import { AttendanceSubmittedScreen } from '@/features/attendance/AttendanceSubmittedScreen';
import { MarkAttendanceScreen } from '@/features/attendance/MarkAttendanceScreen';
import { EarlyLeaveScreen } from '@/features/earlyLeave/EarlyLeaveScreen';
import { LeaveRequestDetailScreen } from '@/features/leave/LeaveRequestDetailScreen';
import { LeaveRequestsScreen } from '@/features/leave/LeaveRequestsScreen';
import { MyLeaveScreen } from '@/features/leave/MyLeaveScreen';
import { MarkEntryScreen } from '@/features/marks/MarkEntryScreen';
import { MarksReviewScreen } from '@/features/marks/MarksReviewScreen';
import { ClassDetailScreen } from '@/features/students/ClassDetailScreen';
import { ClassListScreen } from '@/features/students/ClassListScreen';
import { StudentProfileScreen } from '@/features/students/StudentProfileScreen';
import { StaffDirectoryScreen } from '@/features/staff/StaffDirectoryScreen';
import { StaffProfileScreen } from '@/features/staff/StaffProfileScreen';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { colors, semantic } from '@/theme/tokens';
import { TabsNavigator } from './TabsNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: semantic.primary },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '700' as const },
};

/**
 * Every screen in AdminSpec.md section 10 not yet built renders
 * PlaceholderScreen, tagged with the build task that replaces it (see
 * docs/AdminSpec.md section 17). Registered explicitly (rather than looped
 * from an array) so each screen keeps its own typed route params.
 */
export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={headerOptions}>
      <Stack.Screen name="Tabs" component={TabsNavigator} options={{ headerShown: false }} />

      <Stack.Screen name="ClassList" component={ClassListScreen} options={{ title: 'Classes' }} />
      <Stack.Screen name="ClassDetail" component={ClassDetailScreen} options={{ title: 'Class' }} />
      <Stack.Screen name="StudentProfile" component={StudentProfileScreen} options={{ title: 'Student' }} />

      <Stack.Screen name="MarkAttendance" component={MarkAttendanceScreen} options={{ title: 'Mark attendance' }} />
      <Stack.Screen name="AttendanceSubmitted" component={AttendanceSubmittedScreen} options={{ title: 'Attendance submitted' }} />
      <Stack.Screen name="EarlyLeave" component={EarlyLeaveScreen} options={{ title: 'Early leave' }} />

      <Stack.Screen name="MarkEntry" component={MarkEntryScreen} options={{ title: 'Enter marks' }} />
      <Stack.Screen name="MarksReview" component={MarksReviewScreen} options={{ title: 'Marks review' }} />

      <Stack.Screen name="StaffDirectory" component={StaffDirectoryScreen} options={{ title: 'Staff directory' }} />
      <Stack.Screen name="StaffProfile" component={StaffProfileScreen} options={{ title: 'Staff profile' }} />

      <Stack.Screen name="MyLeave" component={MyLeaveScreen} options={{ title: 'My leave' }} />
      <Stack.Screen name="LeaveRequests" component={LeaveRequestsScreen} options={{ title: 'Leave requests' }} />
      <Stack.Screen name="LeaveRequestDetail" component={LeaveRequestDetailScreen} options={{ title: 'Leave request' }} />

      <Stack.Screen name="ComposeAnnouncement" component={ComposeAnnouncementScreen} options={{ title: 'New announcement' }} />

      <Stack.Screen name="Inventory" options={{ title: 'Inventory' }}>
        {() => <PlaceholderScreen title="Inventory" buildTask={18} />}
      </Stack.Screen>
      <Stack.Screen name="InventoryItem" options={{ title: 'Item' }}>
        {() => <PlaceholderScreen title="Item" buildTask={18} />}
      </Stack.Screen>

      <Stack.Screen name="EventCalendar" options={{ title: 'Events' }}>
        {() => <PlaceholderScreen title="Events" buildTask={19} />}
      </Stack.Screen>
      <Stack.Screen name="EventDetail" options={{ title: 'Event' }}>
        {() => <PlaceholderScreen title="Event" buildTask={19} />}
      </Stack.Screen>
      <Stack.Screen name="Diary" options={{ title: 'School diary' }}>
        {() => <PlaceholderScreen title="School diary" buildTask={19} />}
      </Stack.Screen>

      <Stack.Screen name="AcademicCalendar" options={{ title: 'Academic calendar' }}>
        {() => <PlaceholderScreen title="Academic calendar" buildTask={6} />}
      </Stack.Screen>
      <Stack.Screen name="CalendarDayEditor" options={{ title: 'Edit day' }}>
        {() => <PlaceholderScreen title="Edit day" buildTask={6} />}
      </Stack.Screen>

      <Stack.Screen name="Analytics" options={{ title: 'Analytics' }}>
        {() => <PlaceholderScreen title="Analytics" buildTask={20} />}
      </Stack.Screen>
      <Stack.Screen name="UserAccounts" options={{ title: 'User accounts' }}>
        {() => <PlaceholderScreen title="User accounts" buildTask={21} />}
      </Stack.Screen>
      <Stack.Screen name="AuditLog" options={{ title: 'Audit log' }}>
        {() => <PlaceholderScreen title="Audit log" buildTask={21} />}
      </Stack.Screen>
      <Stack.Screen name="Settings" options={{ title: 'Settings' }}>
        {() => <PlaceholderScreen title="Settings" buildTask={22} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
