import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENABLED_KEY = 'biometric_unlock_enabled';

/**
 * FR-AUTH-04: "after first sign-in the user may enable device biometric
 * unlock for subsequent sessions." Supabase's own session persistence
 * already keeps a signed-in user signed in indefinitely (a long-lived
 * refresh token in AsyncStorage, not a per-launch credential prompt), so
 * there is no separate "log in again" moment for a biometric prompt to
 * substitute for the way the SRS wireframe's SignIn-screen button implies.
 * The faithful equivalent of "unlock for subsequent sessions" under that
 * model is an app-resume lock screen gating the already-valid session
 * behind Face ID/fingerprint — see useAuthStore's `locked` state and
 * BiometricLockScreen, which this module backs.
 */

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED_KEY)) === 'true';
}

export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(ENABLED_KEY);
  }
}

export async function promptBiometricUnlock(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock School Admin',
    disableDeviceFallback: false,
  });
  return result.success;
}
