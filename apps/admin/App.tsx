import 'react-native-gesture-handler';
import '@/i18n';
import { DefaultTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initAttendanceOffline } from '@/features/attendance/init';
import { useSyncEngine } from '@/lib/offline';
import { queryClient } from '@/lib/queryClient';
import { useSessionLiveness } from '@/store/authStore';
import { RootNavigator } from '@/navigation/RootNavigator';
import { colors, semantic } from '@/theme/tokens';

const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: semantic.primary,
    background: semantic.background,
    card: semantic.surface,
    text: semantic.textPrimary,
    border: semantic.border,
    notification: colors.gold500,
  },
};

export default function App() {
  useSyncEngine();
  useSessionLiveness();
  useEffect(() => {
    void initAttendanceOffline();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer theme={navigationTheme}>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="light" />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
