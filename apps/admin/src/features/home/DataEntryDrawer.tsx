import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card, Hero, HeroDoodle, Icon, type IconName } from '@/components';
import { useMyRoleKeys } from '@/features/accounts/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { label: string; route: keyof RootStackParamList; icon: IconName };

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// The recording/entry screens that used to live in the More tab — pulled out
// so they're one tap from Home instead of buried in that catch-all list.
export const dataEntryMenu: MenuItem[] = [
  { label: 'Staff attendance', route: 'MarkStaffAttendance', icon: 'checkmark-circle-outline' },
  { label: 'My leave', route: 'MyLeave', icon: 'briefcase-outline' },
  { label: 'Assign cover teacher', route: 'AssignCover', icon: 'swap-horizontal-outline' },
  { label: 'Inventory', route: 'Inventory', icon: 'cube-outline' },
  { label: 'Events', route: 'EventCalendar', icon: 'calendar-outline' },
  { label: 'School diary', route: 'Diary', icon: 'book-outline' },
];

/** 'vice_principal' -> 'Vice Principal' — mirrors the display names seeded in roles.name. */
function formatRoleLabel(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function DataEntryDrawerContent({ navigation, onClose }: { navigation: Nav; onClose: () => void }) {
  const staff = useAuthStore((s) => s.staff);
  const { data: roleKeys } = useMyRoleKeys();

  return (
    <View style={styles.container}>
      <Hero style={styles.hero}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="briefcase-outline" />
        {staff ? (
          <View style={styles.identity}>
            <Avatar name={staff.fullName} tone="onPrimary" size={56} style={styles.avatar} />
            <View style={styles.identityText}>
              <Text style={styles.name} numberOfLines={1}>
                {staff.fullName}
              </Text>
              <Text style={styles.staffNo}>{staff.staffNo}</Text>
              {roleKeys && roleKeys.length > 0 ? (
                <View style={styles.roleRow}>
                  {roleKeys.map((key) => (
                    <View key={key} style={styles.roleChip}>
                      <Icon name="shield-checkmark-outline" size={12} color={colors.gold900} />
                      <Text style={styles.roleChipLabel}>{formatRoleLabel(key)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </Hero>

      <ScrollView contentContainerStyle={styles.menuWrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>DSPS OFFICE</Text>
        {dataEntryMenu.map((item) => (
          <Card
            key={item.route}
            flat
            style={styles.menuCard}
            onPress={() => {
              onClose();
              navigation.navigate(item.route as never);
            }}
          >
            <View style={styles.menuRow}>
              <View style={styles.iconWrap}>
                <Icon name={item.icon} size={18} color={semantic.primary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Icon name="chevron-forward" size={16} color={colors.ink300} />
            </View>
          </Card>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Icon name="school-outline" size={14} color={semantic.textSecondary} />
        <Text style={styles.footerText}>DSPS Office · v{APP_VERSION}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: semantic.background },
  hero: { paddingHorizontal: spacing.lg, overflow: 'hidden', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  identityText: { flex: 1, gap: 2 },
  name: { ...typography.subtitle, color: colors.white },
  staffNo: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold100,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  roleChipLabel: { ...typography.captionStrong, color: colors.gold900, fontSize: 11 },
  menuWrap: { padding: spacing.lg, gap: spacing.sm },
  sectionLabel: { ...typography.captionStrong, color: semantic.textSecondary, marginBottom: spacing.xs },
  menuCard: { padding: spacing.md },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { ...typography.body, color: semantic.textPrimary, flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  footerText: { ...typography.caption, color: semantic.textSecondary },
});
