import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Button, Card, Hero, Screen, ScreenHeader, StatusPill } from '@/components';
import { isBiometricAvailable, isBiometricUnlockEnabled, setBiometricUnlockEnabled } from '@/lib/biometrics';
import { hasUnsyncedOperations } from '@/lib/offline';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';
import { registerDevice } from './api';

/**
 * section 10 Settings: "own profile, notification preferences, language".
 * Language is fixed to English (section 15 open decision #8 — i18n
 * infrastructure exists, but only one bundle ships).
 */
export function SettingsScreen() {
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [notifStatus, setNotifStatus] = useState<'idle' | 'enabling' | 'enabled' | 'unavailable' | 'denied'>('idle');
  const [notifError, setNotifError] = useState<string | null>(null);
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
    await doSignOut();
  }

  async function doSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function enableNotifications() {
    if (!staff) return;
    setNotifStatus('enabling');
    setNotifError(null);
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!projectId) {
        setNotifStatus('unavailable');
        setNotifError('This build has no EAS project configured, so push tokens cannot be issued yet.');
        return;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setNotifStatus('denied');
        return;
      }
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      await registerDevice(staff.id, token.data, Platform.OS);
      setNotifStatus('enabled');
    } catch {
      setNotifStatus('unavailable');
      setNotifError('Could not enable notifications on this device.');
    }
  }

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero>
        <ScreenHeader title="Settings" tone="onPrimary" back={navigation.canGoBack()} />
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>PROFILE</Text>
        <Row label="Name" value={staff?.fullName ?? '—'} />
        <Row label="Staff no." value={staff?.staffNo ?? '—'} />
        <Row label="Email" value={session?.user.email ?? '—'} />
      </Card>

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>NOTIFICATIONS</Text>
        {notifStatus === 'enabled' ? (
          <StatusPill label="Enabled on this device" tone="success" />
        ) : notifStatus === 'denied' ? (
          <StatusPill label="Permission denied" tone="error" />
        ) : (
          <Button label="Enable push notifications" onPress={() => void enableNotifications()} loading={notifStatus === 'enabling'} />
        )}
        {notifError ? <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{notifError}</Text> : null}
      </Card>

      {biometricAvailable ? (
        <Card>
          <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>SECURITY</Text>
          <Button
            label={biometricEnabled ? 'Biometric unlock enabled' : 'Enable biometric unlock'}
            icon={biometricEnabled ? 'checkmark' : undefined}
            variant={biometricEnabled ? 'outline' : 'primary'}
            onPress={() => void toggleBiometric()}
            loading={biometricBusy}
          />
          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
            When enabled, returning to the app after it has been backgrounded asks for Face ID/fingerprint instead of leaving you signed in unprotected.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LANGUAGE</Text>
        <Text style={{ ...typography.body, color: semantic.textPrimary }}>English</Text>
      </Card>

      <Button label="Sign out" variant="danger" onPress={() => void confirmSignOut()} loading={signingOut} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ ...typography.body, color: semantic.textSecondary }}>{label}</Text>
      <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }}>{value}</Text>
    </View>
  );
}
