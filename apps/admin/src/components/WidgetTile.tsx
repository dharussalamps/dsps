import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, semantic, spacing, typography } from '@/theme/tokens';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';

export type WidgetTint = { fg: string; bg: string };

type Props = PropsWithChildren<{
  icon: IconName;
  label: string;
  accessory?: ReactNode;
  onPress?: () => void;
  tint?: WidgetTint;
}>;

/**
 * Compact tile shared by every Home dashboard widget — a smaller, flatter
 * `Card` with a dense icon-chip + overline header, sized to sit two-up in
 * HomeScreen's widget grid. Distinct from SectionHeader (used for full-width
 * card sections elsewhere) by design: overline (11px) instead of caption
 * (13px) reads as "dashboard tile" rather than "section of a page", and the
 * smaller chip/padding is what makes the 2-column grid fit more on screen.
 */
export function WidgetTile({ icon, label, accessory, onPress, tint, children }: Props) {
  return (
    <Card flat onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconChip, tint ? { backgroundColor: tint.bg } : null]}>
          <Icon name={icon} size={12} color={tint?.fg ?? semantic.primary} />
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {accessory}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconChip: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.overline, color: semantic.textSecondary, flex: 1 },
});
