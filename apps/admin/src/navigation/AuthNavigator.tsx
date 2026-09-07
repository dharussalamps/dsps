import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlaceholderScreen } from '@/screens/PlaceholderScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn">{() => <PlaceholderScreen title="Sign in" buildTask={3} />}</Stack.Screen>
      <Stack.Screen name="SetPassword">
        {() => <PlaceholderScreen title="Set password" buildTask={3} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
