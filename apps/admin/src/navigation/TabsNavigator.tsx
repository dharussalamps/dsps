import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DrawerLayout } from 'react-native-gesture-handler';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { AnnouncementsScreen } from '@/features/announcements/AnnouncementsScreen';
import { useUnreadAnnouncementCount } from '@/features/announcements/hooks';
import { AttendanceBoardScreen } from '@/features/attendance/AttendanceBoardScreen';
import { DataEntryDrawerContent } from '@/features/home/DataEntryDrawer';
import { HomeScreen } from '@/features/home/HomeScreen';
import { MoreScreen } from '@/features/more/MoreScreen';
import { StaffDirectoryScreen } from '@/features/staff/StaffDirectoryScreen';
import { StudentSearchScreen } from '@/features/students/StudentSearchScreen';
import { useAuthStore } from '@/store/authStore';
import { DrawerProvider } from './DrawerContext';
import { CustomTabBar } from './TabBar';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Sets its own tabBarBadge via setOptions (React Navigation's documented way to update a
 * badge dynamically) instead of TabsNavigator computing it and passing it down as a prop.
 * The latter made TabsNavigator itself re-render on every unread-count tick, which recreated
 * the renderNavigationView closure handed to DrawerLayout below and was implicated in the
 * drawer's "Announcements" item needing two taps to open (a render landing mid-touch dropped
 * the first one) — see DataEntryDrawer.tsx for the matching fix on the drawer's own badge.
 */
function AnnouncementsTabScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, 'Announcements'>>();
  const staffId = useAuthStore((s) => s.staff?.id);
  const unread = useUnreadAnnouncementCount(staffId);

  useEffect(() => {
    navigation.setOptions({ tabBarBadge: unread.data && unread.data > 0 ? unread.data : undefined });
  }, [navigation, unread.data]);

  return <AnnouncementsScreen />;
}

/**
 * The five always-visible destinations. Everything else in section 10 is
 * reached by pushing onto the root stack from one of these (see
 * AppNavigator) — e.g. Home's "my class" card pushes MarkAttendance,
 * StudentSearch pushes ClassList/ClassDetail/StudentProfile, More pushes
 * everything permission-gated and lower-frequency. Principals get the Staff
 * directory in this slot instead of Announcements — see useIsPrincipal.
 *
 * The DSPS-office drawer is mounted once here (rather than per-screen) so
 * every tab's hamburger button — not just Home's — opens the same drawer;
 * DrawerProvider hands each tab-root screen an openDrawer callback via
 * useOpenDrawer.
 */
export function TabsNavigator() {
  const { t } = useTranslation();
  const isPrincipal = useIsPrincipal();
  const navigation = useNavigation<Nav>();
  const drawerRef = useRef<DrawerLayout>(null);
  const closeDrawer = useCallback(() => drawerRef.current?.closeDrawer(), []);
  const renderNavigationView = useCallback(
    () => <DataEntryDrawerContent navigation={navigation} onClose={closeDrawer} />,
    [navigation, closeDrawer],
  );

  return (
    <DrawerLayout ref={drawerRef} drawerWidth={280} drawerPosition="left" renderNavigationView={renderNavigationView}>
      <DrawerProvider openDrawer={() => drawerRef.current?.openDrawer()}>
        <Tab.Navigator
          initialRouteName="Home"
          screenOptions={{ headerShown: false }}
          tabBar={(props) => <CustomTabBar {...props} />}
        >
          <Tab.Screen name="StudentSearch" component={StudentSearchScreen} options={{ title: t('nav.students') }} />
          <Tab.Screen name="AttendanceBoard" component={AttendanceBoardScreen} options={{ title: t('nav.attendance') }} />
          <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('nav.home') }} />
          {isPrincipal ? (
            <Tab.Screen name="StaffTab" component={StaffDirectoryScreen} options={{ title: t('nav.staff') }} />
          ) : (
            <Tab.Screen name="Announcements" component={AnnouncementsTabScreen} options={{ title: t('nav.announcements') }} />
          )}
          <Tab.Screen name="More" component={MoreScreen} options={{ title: t('nav.more') }} />
        </Tab.Navigator>
      </DrawerProvider>
    </DrawerLayout>
  );
}
