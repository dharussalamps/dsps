import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, Hero, HeroDoodle, Icon, Screen, ScreenHeader, type IconName } from '@/components';
import { Text, View } from 'react-native';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { label: string; route: keyof RootStackParamList; icon: IconName };

// AdminSpec.md section 10: "More | permission-filtered menu with badges".
// Every entry is shown for now — filtering by the signed-in staff member's
// actual grants lands once build task 21 (accounts/permissions) exists;
// see docs/AdminSpec.md section 17. The data-entry screens (Request leave, Assign
// cover teacher, Inventory, Events, School diary) moved to the Home screen's
// left drawer — see DataEntryDrawer.tsx.
const menu: MenuItem[] = [
  { label: 'Staff directory', route: 'StaffDirectory', icon: 'people-outline' },
  { label: 'Set class', route: 'SetClass', icon: 'swap-horizontal-outline' },
  { label: 'Leave requests', route: 'LeaveRequests', icon: 'checkmark-done-outline' },
  { label: 'Leave allocation', route: 'LeaveAllocation', icon: 'calendar-outline' },
  { label: 'Marks review', route: 'MarksReview', icon: 'document-text-outline' },
  { label: 'Exams & marks', route: 'Exams', icon: 'school-outline' },
  { label: 'Academic calendar', route: 'AcademicCalendar', icon: 'calendar-outline' },
  { label: 'Classes, subjects & terms', route: 'AcademicStructure', icon: 'layers-outline' },
  { label: 'Analytics', route: 'Analytics', icon: 'stats-chart-outline' },
  { label: 'Staff accounts', route: 'UserAccounts', icon: 'key-outline' },
  { label: 'Audit log', route: 'AuditLog', icon: 'time-outline' },
  { label: 'Notifications', route: 'Notifications', icon: 'notifications-outline' },
  { label: 'Settings', route: 'Settings', icon: 'settings-outline' },
];

export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const staff = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="grid-outline" bottomIcon="school-outline" />
        <ScreenHeader title={t('nav.more')} tone="onPrimary" />
        {staff ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs }}>
            <Avatar name={staff.fullName} tone="onPrimary" size={48} />
            <View>
              <Text style={{ ...typography.subtitle, color: colors.white }}>{staff.fullName}</Text>
              <Text style={{ ...typography.caption, color: colors.cream100 }}>{staff.staffNo}</Text>
            </View>
          </View>
        ) : null}
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        {menu.map((item) => (
          <Card key={item.route} onPress={() => navigation.navigate(item.route as never)} flat style={styles.row}>
            <View style={styles.rowContent}>
              <View style={styles.iconWrap}>
                <Icon name={item.icon} size={19} color={semantic.primary} />
              </View>
              <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>{item.label}</Text>
              <Icon name="chevron-forward" size={18} color={colors.ink300} />
            </View>
          </Card>
        ))}

        <Card onPress={() => void signOut()} flat style={styles.row}>
          <View style={styles.rowContent}>
            <View style={[styles.iconWrap, { backgroundColor: colors.errorBg }]}>
              <Icon name="log-out-outline" size={19} color={colors.error} />
            </View>
            <Text style={{ ...typography.body, color: colors.error, flex: 1 }}>{t('common.signOut')}</Text>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = {
  row: { padding: spacing.md },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md } as const,
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
} as const;
