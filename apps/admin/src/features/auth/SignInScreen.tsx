import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DimensionValue, Image, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Icon, IconName, Screen, TextField } from '@/components';
import { supabase } from '@/lib/supabase';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

type Mode = 'signIn' | 'resetRequest' | 'resetVerify';

type Doodle = {
  name: IconName;
  top?: DimensionValue;
  bottom?: DimensionValue;
  left?: DimensionValue;
  right?: DimensionValue;
  size: number;
  rotate: string;
  opacity: number;
  color?: string;
};

/**
 * Learning-themed glyphs across the footer band. The card overlaps roughly
 * the top half of this band, so every doodle sits low (bottom <= 120) in the
 * strip that stays fully clear of the card, arranged as three mirrored rows.
 */
const FOOTER_DOODLES: Doodle[] = [
  // Row 1 — highest row still clear of the card, widest to narrowest inset.
  { name: 'star-outline', bottom: 112, left: '8%', size: 36, rotate: '0deg', opacity: 0.24 },
  { name: 'musical-notes-outline', bottom: 116, left: '30%', size: 32, rotate: '-6deg', opacity: 0.18 },
  { name: 'trophy-outline', bottom: 114, right: '30%', size: 34, rotate: '8deg', opacity: 0.18 },
  { name: 'color-palette-outline', bottom: 110, right: '8%', size: 38, rotate: '-10deg', opacity: 0.2 },
  // Row 2 — middle row.
  { name: 'compass-outline', bottom: 66, left: '6%', size: 32, rotate: '4deg', opacity: 0.16 },
  { name: 'book-outline', bottom: 64, left: '26%', size: 34, rotate: '-14deg', opacity: 0.18 },
  { name: 'rocket-outline', bottom: 64, right: '26%', size: 34, rotate: '-8deg', opacity: 0.18 },
  { name: 'medal-outline', bottom: 66, right: '6%', size: 34, rotate: '-4deg', opacity: 0.16 },
  // Row 3 — bottom row, kept clear of center where the version label sits.
  { name: 'happy-outline', bottom: 26, left: '18%', size: 32, rotate: '6deg', opacity: 0.18 },
  { name: 'school-outline', bottom: 28, right: '18%', size: 38, rotate: '8deg', opacity: 0.2 },
];

/**
 * Learning-themed glyphs on the light top band, laid out as four mirrored
 * rows in the side margins so the crest, name, and location pill stay clear.
 */
const TOP_DOODLES: Doodle[] = [
  { name: 'bulb-outline', top: 0, left: '5%', size: 44, rotate: '-10deg', opacity: 0.18, color: colors.gold700 },
  { name: 'library-outline', top: 0, right: '4%', size: 44, rotate: '10deg', opacity: 0.18, color: semantic.primary },
  { name: 'shapes-outline', top: 92, left: '3%', size: 36, rotate: '8deg', opacity: 0.15, color: semantic.primary },
  { name: 'extension-puzzle-outline', top: 92, right: '2%', size: 36, rotate: '-12deg', opacity: 0.15, color: colors.gold700 },
  { name: 'telescope-outline', top: 178, left: '4%', size: 32, rotate: '-8deg', opacity: 0.14, color: semantic.primary },
  { name: 'star-outline', top: 178, right: '3%', size: 32, rotate: '6deg', opacity: 0.16, color: colors.gold700 },
  { name: 'heart-outline', bottom: 4, left: '12%', size: 34, rotate: '-6deg', opacity: 0.17, color: colors.gold700 },
  { name: 'ribbon-outline', bottom: 2, right: '11%', size: 36, rotate: '10deg', opacity: 0.17, color: semantic.primary },
];

function DoodleField({ items, defaultColor }: { items: Doodle[]; defaultColor: string }) {
  return (
    <View style={styles.doodleLayer} pointerEvents="none">
      {items.map((d, i) => (
        <Icon
          key={i}
          name={d.name}
          size={d.size}
          color={d.color ?? defaultColor}
          style={{
            position: 'absolute',
            top: d.top,
            bottom: d.bottom,
            left: d.left,
            right: d.right,
            opacity: d.opacity,
            transform: [{ rotate: d.rotate }],
          }}
        />
      ))}
    </View>
  );
}

/** Decorative maroon strip anchored to the bottom of the screen — books, stars, planets peeking up. */
function BrandFooter() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.brandFooter, { paddingBottom: insets.bottom }]}>
      <View style={[styles.blob, styles.blobShade]} />
      <View style={[styles.blob, styles.blobGold]} />
      <View style={[styles.blob, styles.blobTeal]} />
      <DoodleField items={FOOTER_DOODLES} defaultColor={colors.cream50} />
      <Text style={[styles.officeText, { bottom: insets.bottom + spacing.sm + typography.caption.fontSize + 2 }]}>OFFICE</Text>
      <Text style={[styles.versionText, { bottom: insets.bottom + spacing.sm }]}>v{APP_VERSION}</Text>
    </View>
  );
}

export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [resetEmail, setResetEmail] = useState('');
  const insets = useSafeAreaInsets();

  return (
    <Screen padded={false} edges={['left', 'right']} style={styles.pageContent}>
      <StatusBar style="dark" />
      <BrandFooter />
      <View style={[styles.brandTop, { paddingTop: insets.top + spacing.xl }]}>
        <View style={[styles.blob, styles.topBlobGold]} />
        <View style={[styles.blob, styles.topBlobTeal]} />
        <DoodleField items={TOP_DOODLES} defaultColor={semantic.primary} />
        <Image source={require('../../../assets/icon.png')} style={styles.crest} resizeMode="contain" />
        <Text style={styles.schoolName}>WP/GM/Dharussalam Primary School</Text>
        <View style={styles.placePill}>
          <Icon name="location-outline" size={13} color={semantic.primary} />
          <Text style={styles.schoolPlace}>Thihariya</Text>
        </View>
      </View>

      <View style={styles.formWrap}>
        <Card style={styles.formCard}>
          {mode === 'signIn' && <SignInForm onForgotPassword={() => setMode('resetRequest')} />}
          {mode === 'resetRequest' && (
            <ResetRequestForm
              onSent={(email) => {
                setResetEmail(email);
                setMode('resetVerify');
              }}
              onCancel={() => setMode('signIn')}
            />
          )}
          {mode === 'resetVerify' && <ResetVerifyForm email={resetEmail} onDone={() => setMode('signIn')} />}
        </Card>
      </View>
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

function ResetRequestForm({ onSent, onCancel }: { onSent: (email: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    const trimmedEmail = email.trim();
    // shouldCreateUser: false — every real login here is provisioned by
    // create-staff-login (principal-triggered, permission-checked); this
    // screen must never silently create a fresh auth.users row for an
    // arbitrary typed-in email.
    const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { shouldCreateUser: false } });
    setLoading(false);
    if (otpError) {
      setError(t('auth.resetError'));
      return;
    }
    onSent(trimmedEmail);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.title}>{t('auth.resetTitle')}</Text>
      <Text style={styles.hint}>{t('auth.resetHint')}</Text>
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={error ?? undefined}
      />
      <Button label={t('auth.sendCode')} onPress={submit} loading={loading} disabled={!email} />
      <Button label={t('auth.backToSignIn')} variant="ghost" size="sm" onPress={onCancel} />
    </View>
  );
}

function ResetVerifyForm({ email, onDone }: { email: string; onDone: () => void }) {
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
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (verifyError) {
      setLoading(false);
      setError(t('auth.verifyError'));
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword, data: { needs_password_set: false } });
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
  pageContent: { flexGrow: 1 },
  brandTop: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  topBlobGold: {
    width: 150,
    height: 150,
    top: -60,
    left: -50,
    backgroundColor: colors.gold300,
    opacity: 0.22,
  },
  topBlobTeal: {
    width: 130,
    height: 130,
    top: -40,
    right: -40,
    backgroundColor: colors.teal500,
    opacity: 0.12,
  },
  crest: { width: 148, height: 148, marginBottom: spacing.md },
  schoolName: {
    ...typography.title,
    color: semantic.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  placePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.maroon50,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  schoolPlace: { ...typography.captionStrong, color: semantic.primary },
  formWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  formCard: { gap: spacing.sm },
  form: { gap: spacing.md },
  title: { ...typography.title, color: semantic.textPrimary },
  hint: { ...typography.body, color: semantic.textSecondary },
  brandFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 340,
    backgroundColor: semantic.primary,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  versionText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    ...typography.caption,
    color: 'rgba(255,255,255,0.55)',
  },
  officeText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    ...typography.captionStrong,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  blob: { position: 'absolute', borderRadius: 999 },
  blobShade: {
    width: 190,
    height: 190,
    top: -70,
    left: -50,
    backgroundColor: colors.maroon900,
    opacity: 0.35,
  },
  blobGold: {
    width: 140,
    height: 140,
    top: -50,
    right: -40,
    backgroundColor: colors.gold500,
    opacity: 0.18,
  },
  blobTeal: {
    width: 120,
    height: 120,
    bottom: -40,
    right: -30,
    backgroundColor: colors.teal500,
    opacity: 0.16,
  },
  doodleLayer: { ...StyleSheet.absoluteFill },
});
