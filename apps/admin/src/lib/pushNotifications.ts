import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerDevice } from '@/features/settings/api';
import { useAuthStore } from '@/store/authStore';

/**
 * Push notifications are a core feature (announcements, reminders), not an
 * opt-in extra, so there's no "enable notifications" button in Settings —
 * this registers the device automatically the moment a session goes
 * signedIn, requesting OS permission if it hasn't been decided yet. Mount
 * once at the app root, alongside useSessionLiveness/useBiometricLock.
 */
export function usePushNotificationRegistration(): void {
  const status = useAuthStore((s) => s.status);
  const staffId = useAuthStore((s) => s.staff?.id);

  useEffect(() => {
    if (status !== 'signedIn' || !staffId) return;
    let cancelled = false;
    void (async () => {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!projectId) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let granted = existing === 'granted';
      if (!granted && existing !== 'denied') {
        const { status: requested } = await Notifications.requestPermissionsAsync();
        granted = requested === 'granted';
      }
      if (!granted || cancelled) return;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      if (cancelled) return;
      await registerDevice(staffId, token.data, Platform.OS);
    })().catch(() => {
      // Best-effort: a failed registration just means this device won't get
      // pushes yet. There's no UI to surface it to, and it'll retry next login.
    });
    return () => {
      cancelled = true;
    };
  }, [status, staffId]);
}
