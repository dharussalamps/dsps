import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SetPasswordScreen } from '@/features/auth/SetPasswordScreen';
import { initAuthListener, useAuthStore } from '@/store/authStore';
import { semantic } from '@/theme/tokens';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);

  useEffect(() => initAuthListener(), []);

  if (status === 'initializing') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background }}>
        <ActivityIndicator size="large" color={semantic.primary} />
      </View>
    );
  }

  if (status === 'signedIn') return <AppNavigator />;
  if (status === 'needsPasswordSet') return <SetPasswordScreen />;
  return <AuthNavigator />;
}
