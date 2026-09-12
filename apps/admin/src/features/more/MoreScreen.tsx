import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Hero, HeroDoodle, Icon, Screen, ScreenHeader, type IconName } from '@/components';
import { useOpenDrawer } from '@/navigation/DrawerContext';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { label: string; route: keyof RootStackParamList; icon: IconName };
type Tint = { fg: string; bg: string };

const tints = {
  gold: { fg: colors.gold700, bg: semantic.secondaryMuted },
  teal: { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' },
  info: { fg: colors.info, bg: colors.infoBg },
} as const satisfies Record<string, Tint>;

type Group = { title: string; icon: IconName; tint: Tint; items: MenuItem[] };

// AdminSpec.md section 10: "More | permission-filtered menu with badges".
// Every entry is shown for now — filtering by the signed-in staff member's
// actual grants lands once build task 21 (accounts/permissions) exists;
// see docs/AdminSpec.md section 17. The data-entry screens (Request leave, Assign
// cover teacher, Inventory, Events, School diary) moved to the Home screen's
// left drawer — see DataEntryDrawer.tsx.
const groups: Group[] = [
  {
    title: 'Leave & attendance',
    icon: 'checkmark-done-outline',
    tint: tints.teal,
    items: [
      { label: 'Staff attendance', route: 'MarkStaffAttendance', icon: 'checkmark-circle-outline' },
      { label: 'Leave requests', route: 'LeaveRequests', icon: 'checkmark-done-outline' },
      { label: 'Assign cover teacher', route: 'AssignCover', icon: 'swap-horizontal-outline' },
    ],
  },
  {
    title: 'Academics',
    icon: 'school-outline',
    tint: tints.gold,
    items: [{ label: 'Exams & marks', route: 'Exams', icon: 'school-outline' }],
  },
  {
    title: 'Insights',
    icon: 'stats-chart-outline',
    tint: tints.info,
    items: [
      { label: 'Analytics', route: 'Analytics', icon: 'stats-chart-outline' },
      { label: 'Audit log', route: 'AuditLog', icon: 'time-outline' },
    ],
  },
];

export function MoreScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const openDrawer = useOpenDrawer();

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="grid-outline" bottomIcon="school-outline" />
        <ScreenHeader
          title={t('nav.more')}
          subtitle="Tools, records & settings"
          tone="onPrimary"
          onMenuPress={openDrawer}
        />
      </Hero>

      <View style={styles.body}>
        {groups.map((group) => (
          <MenuGroup key={group.title} group={group} onNavigate={(route) => navigation.navigate(route as never)} />
        ))}
      </View>
    </Screen>
  );
}

function MenuGroup({ group, onNavigate }: { group: Group; onNavigate: (route: keyof RootStackParamList) => void }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.groupHeader}>
        <View style={[styles.groupIconChip, { backgroundColor: group.tint.bg }]}>
          <Icon name={group.icon} size={13} color={group.tint.fg} />
        </View>
        <Text style={styles.groupTitle}>{group.title.toUpperCase()}</Text>
      </View>
      <Card flat style={styles.groupCard}>
        {group.items.map((item, idx) => (
          <Pressable
            key={item.route}
            onPress={() => onNavigate(item.route)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.row,
              idx < group.items.length - 1 && styles.rowDivider,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: group.tint.bg }]}>
              <Icon name={item.icon} size={18} color={group.tint.fg} />
            </View>
            <Text style={{ ...typography.body, color: semantic.textPrimary, flex: 1 }}>{item.label}</Text>
            <Icon name="chevron-forward" size={18} color={colors.ink300} />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.xl },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.xs },
  groupIconChip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  groupCard: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: semantic.border },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
