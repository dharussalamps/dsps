import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, TextField } from '@/components';
import { supabase } from '@/lib/supabase';
import { semantic, spacing, typography } from '@/theme/tokens';

type Mode = 'signIn' | 'resetRequest' | 'resetVerify';

export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [resetPhone, setResetPhone] = useState('');

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.brand}>
        <Image source={require('../../../assets/icon.png')} style={styles.crest} resizeMode="contain" />
        <Text style={styles.schoolName}>WP/GM/Dharussalam Primary School</Text>
        <Text style={styles.schoolPlace}>Thihariya</Text>
      </View>

      <Card>
        {mode === 'signIn' && <SignInForm onForgotPassword={() => setMode('resetRequest')} />}
        {mode === 'resetRequest' && (
          <ResetRequestForm
            onSent={(phone) => {
              setResetPhone(phone);
              setMode('resetVerify');
            }}
            onCancel={() => setMode('signIn')}
          />
        )}
        {mode === 'resetVerify' && <ResetVerifyForm phone={resetPhone} onDone={() => setMode('signIn')} />}
      </Card>
    </Screen>
  );
}

function SignInForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) setError(t('auth.signInError'));
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{t('auth.signIn')}</Text>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        error={error ?? undefined}
      />
      <Button label={t('auth.signIn')} onPress={submit} loading={loading} disabled={!email || !password} />
      <Button label={t('auth.forgotPassword')} variant="ghost" size="sm" onPress={onForgotPassword} />
    </View>
  );
}

function ResetRequestForm({ onSent, onCancel }: { onSent: (phone: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    const trimmedPhone = phone.trim();
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: trimmedPhone });
    setLoading(false);
    if (otpError) {
      setError(t('auth.resetError'));
      return;
    }
    onSent(trimmedPhone);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{t('auth.resetTitle')}</Text>
      <Text style={styles.hint}>{t('auth.resetHint')}</Text>
      <TextField
        label={t('auth.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={error ?? undefined}
      />
      <Button label={t('auth.sendCode')} onPress={submit} loading={loading} disabled={!phone} />
      <Button label={t('auth.backToSignIn')} variant="ghost" size="sm" onPress={onCancel} />
    </View>
  );
}

function ResetVerifyForm({ phone, onDone }: { phone: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (verifyError) {
      setLoading(false);
      setError(t('auth.verifyError'));
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updateError) {
      setError(t('auth.verifyError'));
      return;
    }
    onDone();
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{t('auth.resetTitle')}</Text>
      <Text style={styles.hint}>{t('auth.resetCodeSentHint')}</Text>
      <TextField label={t('auth.code')} value={code} onChangeText={setCode} keyboardType="number-pad" />
      <TextField label={t('auth.newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <TextField
        label={t('auth.confirmPassword')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        error={error ?? undefined}
      />
      <Button
        label={t('auth.verifyAndContinue')}
        onPress={submit}
        loading={loading}
        disabled={!code || !newPassword || !confirmPassword}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxl, marginBottom: spacing.xl },
  crest: { width: 96, height: 96 },
  schoolName: { ...typography.subtitle, color: semantic.textPrimary, textAlign: 'center' },
  schoolPlace: { ...typography.caption, color: semantic.textSecondary },
  form: { gap: spacing.md },
  title: { ...typography.title, color: semantic.textPrimary },
  hint: { ...typography.body, color: semantic.textSecondary },
});
