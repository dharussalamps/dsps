import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import { colors, semantic } from '@/theme/tokens';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * The five always-visible destinations. Everything else in section 10 is
 * reached by pushing onto the root stack from one of these (see
 * AppNavigator) — e.g. Home's "my class" card pushes MarkAttendance,
 * StudentSearch pushes ClassList/ClassDetail/StudentProfile, More pushes
 * everything permission-gated and lower-frequency.
 */
export function TabsNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: semantic.primary,
        tabBarInactiveTintColor: colors.ink300,
        tabBarStyle: { backgroundColor: semantic.surface, borderTopColor: semantic.border },
      }}
    >
      <Tab.Screen name="Home" options={{ title: t('nav.home') }}>
        {() => <PlaceholderScreen title={t('nav.home')} />}
      </Tab.Screen>
      <Tab.Screen name="StudentSearch" options={{ title: t('nav.students') }}>
        {() => <PlaceholderScreen title={t('nav.students')} buildTask={7} />}
      </Tab.Screen>
      <Tab.Screen name="AttendanceBoard" options={{ title: t('nav.attendance') }}>
        {() => <PlaceholderScreen title={t('nav.attendance')} buildTask={10} />}
      </Tab.Screen>
      <Tab.Screen name="Announcements" options={{ title: t('nav.announcements') }}>
        {() => <PlaceholderScreen title={t('nav.announcements')} buildTask={16} />}
      </Tab.Screen>
      <Tab.Screen name="More" options={{ title: t('nav.more') }}>
        {() => <PlaceholderScreen title={t('nav.more')} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
