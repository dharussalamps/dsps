import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export type PillTone = 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'gold';

type Props = {
  label: string;
  tone?: PillTone;
};

const toneStyles: Record<PillTone, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  error: { bg: colors.errorBg, fg: colors.error },
  info: { bg: colors.infoBg, fg: colors.info },
  neutral: { bg: colors.cream100, fg: colors.ink500 },
  gold: { bg: colors.gold100, fg: colors.gold900 },
};

/** Small rounded status label — e.g. attendance status, submission state. */
export function StatusPill({ label, tone = 'neutral' }: Props) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  label: { ...typography.captionStrong },
});
