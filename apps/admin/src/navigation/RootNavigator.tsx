import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { BiometricLockScreen } from '@/features/auth/BiometricLockScreen';
import { SetPasswordScreen } from '@/features/auth/SetPasswordScreen';
import { initAuthListener, useAuthStore, useBiometricLock } from '@/store/authStore';
import { semantic } from '@/theme/tokens';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const locked = useAuthStore((s) => s.locked);

  useEffect(() => initAuthListener(), []);
  useBiometricLock();

  if (status === 'initializing') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
        <ActivityIndicator size="large" color={semantic.primary} />
      </View>
    );
  }

  if (status === 'signedIn') return locked ? <BiometricLockScreen /> : <AppNavigator />;
  if (status === 'needsPasswordSet') return <SetPasswordScreen />;
  return <AuthNavigator />;
}
