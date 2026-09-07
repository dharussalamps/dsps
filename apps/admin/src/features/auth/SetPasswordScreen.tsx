import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Button, Card, Screen, TextField } from '@/components';
import { supabase } from '@/lib/supabase';
import { spacing, typography, semantic } from '@/theme/tokens';

/** Rendered by RootNavigator while auth status is 'needsPasswordSet'. */
export function SetPasswordScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { needs_password_set: false },
    });
    setLoading(false);
    if (updateError) setError(t('auth.verifyError'));
    // On success, the auth listener's onAuthStateChange fires with the
    // updated user, authStore re-evaluates needs_password_set, and
    // RootNavigator switches to the signed-in app on its own.
  }

  return (
    <Screen>
      <Card>
        <View style={{ gap: spacing.md }}>
          <Text style={{ ...typography.title, color: semantic.textPrimary }}>{t('auth.setPasswordTitle')}</Text>
          <Text style={{ ...typography.body, color: semantic.textSecondary }}>{t('auth.setPasswordHint')}</Text>
          <TextField label={t('auth.newPassword')} value={password} onChangeText={setPassword} secureTextEntry />
          <TextField
            label={t('auth.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            error={error ?? undefined}
          />
          <Button
            label={t('common.save')}
            onPress={submit}
            loading={loading}
            disabled={!password || !confirmPassword}
          />
        </View>
      </Card>
    </Screen>
  );
}
