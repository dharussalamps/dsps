import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
// See Card.tsx for why this drawer content uses gesture-handler's Pressable instead of core RN's.
import { Pressable } from 'react-native-gesture-handler';
import { Avatar, Card, Hero, HeroDoodle, Icon, type IconName } from '@/components';
import { useMyRoleKeys } from '@/features/accounts/hooks';
import { useUnreadAnnouncementCount } from '@/features/announcements/hooks';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type MenuItem = { label: string; route: keyof RootStackParamList; icon: IconName };

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// The recording/entry screens that used to live in the More tab — pulled out
// so they're one tap from Home instead of buried in that catch-all list.
export const dataEntryMenu: MenuItem[] = [
  { label: 'Request leave', route: 'MyLeave', icon: 'briefcase-outline' },
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

/**
 * Isolated so its query-driven re-renders don't ripple up into DataEntryDrawerContent — that
 * used to re-render every menu Card (including the Pressable a tap was landing on) whenever
 * the unread count changed, which was implicated in the Announcements item needing two taps
 * to open (a render arriving mid-touch dropped the first one). Same fix as AnnouncementsTabScreen
 * in TabsNavigator.tsx for the tab bar's own badge.
 */
const AnnouncementsMenuBadge = memo(function AnnouncementsMenuBadge({ staffId }: { staffId: string | undefined }) {
  const unread = useUnreadAnnouncementCount(staffId);
  const count = unread.data ?? 0;
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel} numberOfLines={1}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
});

/**
 * Isolated for the same reason as AnnouncementsMenuBadge above: useMyRoleKeys() resolves
 * from loading to success shortly after the drawer mounts, and if that state change were
 * read directly in DataEntryDrawerContent it would re-render every menu Card (including
 * whichever one a tap was landing on) — the same "needs two taps" bug the badge isolation
 * fixed, but for the identity block's role chips instead of the unread count.
 */
const DrawerIdentity = memo(function DrawerIdentity({ navigation, onClose }: { navigation: Nav; onClose: () => void }) {
  const staff = useAuthStore((s) => s.staff);
  const { data: roleKeys } = useMyRoleKeys();

  if (!staff) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="View my profile"
      onPress={() => {
        onClose();
        navigation.navigate('StaffProfile', { staffId: staff.id });
      }}
      style={({ pressed }) => [styles.identity, pressed && styles.identityPressed]}
    >
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
      <Icon name="chevron-forward" size={18} color="rgba(255,255,255,0.75)" />
    </Pressable>
  );
});

export function DataEntryDrawerContent({ navigation, onClose }: { navigation: Nav; onClose: () => void }) {
  const staffId = useAuthStore((s) => s.staff?.id);

  return (
    <View style={styles.container}>
      <Hero style={styles.hero}>
        <HeroDoodle topIcon="ribbon-outline" bottomIcon="briefcase-outline" />
        <DrawerIdentity navigation={navigation} onClose={onClose} />
      </Hero>

      <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuWrap} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>DSPS OFFICE</Text>
        <Card
          flat
          style={styles.menuCard}
          onPress={() => {
            onClose();
            navigation.navigate('Announcements');
          }}
        >
          <View style={styles.menuRow}>
            <View style={styles.iconWrap}>
              <Icon name="megaphone-outline" size={18} color={semantic.primary} />
            </View>
            <Text style={styles.menuLabel}>Announcements</Text>
            <AnnouncementsMenuBadge staffId={staffId} />
            <Icon name="chevron-forward" size={16} color={colors.ink300} />
          </View>
        </Card>
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

      <View style={styles.pinnedSection}>
        <Card
          flat
          style={styles.settingsCard}
          onPress={() => {
            onClose();
            navigation.navigate('Settings' as never);
          }}
        >
          <View style={styles.menuRow}>
            <View style={styles.iconWrapNeutral}>
              <Icon name="settings-outline" size={18} color={colors.ink500} />
            </View>
            <Text style={styles.menuLabelNeutral}>Settings</Text>
            <Icon name="chevron-forward" size={16} color={colors.ink300} />
          </View>
        </Card>
      </View>

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
  identityPressed: { opacity: 0.85 },
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
  menuScroll: { flex: 1 },
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
  iconWrapNeutral: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.cream200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabelNeutral: { ...typography.body, color: semantic.textSecondary, flex: 1 },
  settingsCard: { padding: spacing.md, backgroundColor: 'transparent', borderColor: 'transparent' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { fontSize: 11, fontWeight: '700', color: colors.white },
  pinnedSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
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
