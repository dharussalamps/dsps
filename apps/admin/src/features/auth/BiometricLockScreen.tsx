import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components';
import { promptBiometricUnlock } from '@/lib/biometrics';
import { useAuthStore } from '@/store/authStore';
import { semantic, spacing, typography } from '@/theme/tokens';

/** FR-AUTH-04: shown instead of the app whenever the session is locked (see useAuthStore's `locked` / useBiometricLock). */
export function BiometricLockScreen() {
  const unlock = useAuthStore((s) => s.unlock);
  const signOut = useAuthStore((s) => s.signOut);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);

  async function attempt() {
    setChecking(true);
    setFailed(false);
    try {
      const ok = await promptBiometricUnlock();
      if (ok) unlock();
      else setFailed(true);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    // One-time OS-level side effect (an actual biometric prompt) on mount,
    // not state derived from props/other state — not the pattern these
    // lint rules mean to catch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: semantic.background, gap: spacing.lg, padding: spacing.xl }}>
      <Text style={{ ...typography.title, color: semantic.textPrimary }}>App locked</Text>
      <Text style={{ ...typography.body, color: semantic.textSecondary, textAlign: 'center' }}>
        {failed ? "Couldn't verify — try again, or sign out." : 'Verify your identity to continue.'}
      </Text>
      <Button label="Unlock" onPress={() => void attempt()} loading={checking} />
      <Button label="Sign out instead" variant="ghost" onPress={() => void signOut()} />
    </View>
  );
}
