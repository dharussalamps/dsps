import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  label: string;
  accessory?: ReactNode;
};

/** Icon-chip + caption label used to head every card section (e.g. "MARKS", "GUARDIANS"), with an optional right-aligned action. */
export function SectionHeader({ icon, label, accessory }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.iconChip}>
        <Icon name={icon} size={13} color={semantic.primary} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4, flex: 1 },
  accessory: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
