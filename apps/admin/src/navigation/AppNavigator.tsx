import { createNativeStackNavigator } from '@react-navigation/native-stack';
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

      <Stack.Screen name="MarkAttendance" options={{ title: 'Mark attendance' }}>
        {() => <PlaceholderScreen title="Mark attendance" buildTask={9} />}
      </Stack.Screen>
      <Stack.Screen name="AttendanceSubmitted" options={{ title: 'Attendance submitted' }}>
        {() => <PlaceholderScreen title="Attendance submitted" buildTask={9} />}
      </Stack.Screen>
      <Stack.Screen name="EarlyLeave" options={{ title: 'Early leave' }}>
        {() => <PlaceholderScreen title="Early leave" buildTask={12} />}
      </Stack.Screen>

      <Stack.Screen name="MarkEntry" options={{ title: 'Enter marks' }}>
        {() => <PlaceholderScreen title="Enter marks" buildTask={14} />}
      </Stack.Screen>
      <Stack.Screen name="MarksReview" options={{ title: 'Marks review' }}>
        {() => <PlaceholderScreen title="Marks review" buildTask={14} />}
      </Stack.Screen>

      <Stack.Screen name="StaffDirectory" component={StaffDirectoryScreen} options={{ title: 'Staff directory' }} />
      <Stack.Screen name="StaffProfile" component={StaffProfileScreen} options={{ title: 'Staff profile' }} />

      <Stack.Screen name="MyLeave" options={{ title: 'My leave' }}>
        {() => <PlaceholderScreen title="My leave" buildTask={13} />}
      </Stack.Screen>
      <Stack.Screen name="LeaveRequests" options={{ title: 'Leave requests' }}>
        {() => <PlaceholderScreen title="Leave requests" buildTask={13} />}
      </Stack.Screen>
      <Stack.Screen name="LeaveRequestDetail" options={{ title: 'Leave request' }}>
        {() => <PlaceholderScreen title="Leave request" buildTask={13} />}
      </Stack.Screen>

      <Stack.Screen name="ComposeAnnouncement" options={{ title: 'New announcement' }}>
        {() => <PlaceholderScreen title="New announcement" buildTask={16} />}
      </Stack.Screen>

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
