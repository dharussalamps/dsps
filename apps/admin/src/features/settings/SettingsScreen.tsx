import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SectionHeader, ToggleRow, type IconName } from '@/components';
import { isBiometricAvailable, isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometrics';
import { hasUnsyncedOperations } from '@/lib/offline';
import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/store/authStore';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Tint = { fg: string; bg: string };

const tints = {
  maroon: { fg: semantic.primary, bg: semantic.primaryMuted },
  gold: { fg: colors.gold700, bg: semantic.secondaryMuted },
  teal: { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' },
  info: { fg: colors.info, bg: colors.infoBg },
} as const satisfies Record<string, Tint>;

type AdminItem = { label: string; route: keyof RootStackParamList; icon: IconName; tint: Tint };

const adminItems: AdminItem[] = [
  { label: 'Staff accounts', route: 'UserAccounts', icon: 'key-outline', tint: tints.maroon },
  { label: 'Leave allocation', route: 'LeaveAllocation', icon: 'calendar-outline', tint: tints.gold },
  { label: 'Set class', route: 'SetClass', icon: 'swap-horizontal-outline', tint: tints.teal },
  { label: 'Academic calendar', route: 'AcademicCalendar', icon: 'calendar-outline', tint: tints.info },
  { label: 'Academic structure', route: 'AcademicStructure', icon: 'layers-outline', tint: tints.maroon },
  { label: 'Promote students', route: 'PromoteStudents', icon: 'arrow-up-circle-outline', tint: tints.gold },
  { label: 'Dashboard widgets', route: 'DashboardWidgets', icon: 'grid-outline', tint: tints.teal },
];

/**
 * section 10 Settings. Profile, language, and notification preferences have
 * all been dropped from this screen: profile fields aren't editable here,
 * language is fixed to English (section 15 open decision #8), and push
 * notifications are enabled automatically at login (see
 * usePushNotificationRegistration) with nothing here for the user to see or
 * toggle — there's no "notifications" card because there's nothing to show.
 */
export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const signOut = useAuthStore((s) => s.signOut);

  const [signingOut, setSigningOut] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setBiometricAvailable(await isBiometricAvailable());
      setBiometricEnabled(await isBiometricUnlockEnabled());
    })();
  }, []);

  async function toggleBiometric() {
    setBiometricBusy(true);
    try {
      const next = !biometricEnabled;
      await setBiometricUnlockEnabled(next);
      setBiometricEnabled(next);
    } finally {
      setBiometricBusy(false);
    }
  }

  // NFR-REL-02 vs NFR-SEC-06: sign-out wipes on-device cached data, which
  // would silently discard attendance/marks a teacher marked offline and
  // hasn't synced yet. Warn first, since that data can't be recovered once
  // the local queue is cleared.
  async function confirmSignOut() {
    if (await hasUnsyncedOperations()) {
      Alert.alert(
        'Unsynced data on this device',
        "You have attendance or other entries that haven't reached the server yet. Signing out now will lose them.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign out anyway', style: 'destructive', onPress: () => void doSignOut() },
        ],
      );
      return;
    }
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void doSignOut() },
    ]);
  }

  async function doSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  const appVersion = Constants.expoConfig?.version;

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="settings-outline" bottomIcon="construct-outline" />
        <ScreenHeader title="Settings" subtitle="Security & administration" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {biometricAvailable ? (
          <Card>
            <SectionHeader icon="finger-print-outline" label="SECURITY" />
            <ToggleRow
              icon="lock-closed-outline"
              label="Biometric unlock"
              description="Ask for Face ID / fingerprint when returning to the app after it's been backgrounded."
              value={biometricEnabled}
              busy={biometricBusy}
              onToggle={() => void toggleBiometric()}
            />
          </Card>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <View style={styles.groupHeader}>
            <View style={styles.groupIconChip}>
              <Icon name="briefcase-outline" size={13} color={semantic.primary} />
            </View>
            <Text style={styles.groupTitle}>ADMINISTRATION</Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {adminItems.map((item) => (
              <AdminRow key={item.route} item={item} onPress={() => navigation.navigate(item.route as never)} />
            ))}
          </View>
        </View>

        <Button label="Sign out" variant="danger" icon="log-out-outline" onPress={() => void confirmSignOut()} loading={signingOut} />

        {appVersion ? <Text style={styles.version}>Version {appVersion}</Text> : null}
      </View>
    </Screen>
  );
}

function AdminRow({ item, onPress }: { item: AdminItem; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.adminRow}>
      <View style={[styles.adminIconChip, { backgroundColor: item.tint.bg }]}>
        <Icon name={item.icon} size={18} color={item.tint.fg} />
      </View>
      <Text style={styles.adminRowLabel} numberOfLines={1}>
        {item.label}
      </Text>
      <Icon name="chevron-forward" size={18} color={colors.ink300} />
    </Card>
  );
}

const styles = StyleSheet.create({
  version: { ...typography.caption, color: colors.ink300, textAlign: 'center', marginTop: -spacing.xs },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.xs },
  groupIconChip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  adminRowLabel: { ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 },
  adminIconChip: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
