import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button, Card, Screen, ScreenHeader, StatusPill } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { semantic, typography } from '@/theme/tokens';
import { registerDevice } from './api';

/**
 * section 10 Settings: "own profile, notification preferences, language".
 * Language is fixed to English (section 15 open decision #8 — i18n
 * infrastructure exists, but only one bundle ships).
 */
export function SettingsScreen() {
  const staff = useAuthStore((s) => s.staff);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [notifStatus, setNotifStatus] = useState<'idle' | 'enabling' | 'enabled' | 'unavailable' | 'denied'>('idle');
  const [notifError, setNotifError] = useState<string | null>(null);

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
    <Screen>
      <ScreenHeader title="Settings" />

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

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>LANGUAGE</Text>
        <Text style={{ ...typography.body, color: semantic.textPrimary }}>English</Text>
      </Card>

      <Button label="Sign out" variant="danger" onPress={() => void signOut()} />
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
