import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Card, Screen, ScreenHeader } from '@/components';
import { Text } from 'react-native';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, semantic, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { label: string; route: keyof RootStackParamList };

// AdminSpec.md section 10: "More | permission-filtered menu with badges".
// Every entry is shown for now — filtering by the signed-in staff member's
// actual grants lands once build task 21 (accounts/permissions) exists;
// see docs/AdminSpec.md section 17.
const menu: MenuItem[] = [
  { label: 'Staff directory', route: 'StaffDirectory' },
  { label: 'My leave', route: 'MyLeave' },
  { label: 'Leave requests', route: 'LeaveRequests' },
  { label: 'Inventory', route: 'Inventory' },
  { label: 'Events', route: 'EventCalendar' },
  { label: 'School diary', route: 'Diary' },
  { label: 'Academic calendar', route: 'AcademicCalendar' },
  { label: 'Analytics', route: 'Analytics' },
  { label: 'User accounts', route: 'UserAccounts' },
  { label: 'Audit log', route: 'AuditLog' },
  { label: 'Settings', route: 'Settings' },
];

export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const staff = useAuthStore((s) => s.staff);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <Screen>
      <ScreenHeader title={t('nav.more')} subtitle={staff?.fullName} />
      {menu.map((item) => (
        <Card key={item.route} onPress={() => navigation.navigate(item.route as never)} flat>
          <Text style={{ ...typography.body, color: semantic.textPrimary }}>{item.label}</Text>
        </Card>
      ))}
      <Card onPress={() => void signOut()} flat>
        <Text style={{ ...typography.body, color: colors.error }}>{t('common.signOut')}</Text>
      </Card>
    </Screen>
  );
}
