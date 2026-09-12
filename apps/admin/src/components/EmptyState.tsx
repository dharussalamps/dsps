import { StyleSheet, Text, View } from 'react-native';
import { radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  title: string;
  message?: string;
  /** Optional badge icon shown above the title — omit for the plain text-only layout every existing caller uses. */
  icon?: IconName;
};

export function EmptyState({ title, message, icon }: Props) {
  return (
    <View style={styles.wrap}>
      {icon ? (
        <View style={styles.iconBadge}>
          <Icon name={icon} size={26} color={semantic.primary} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.xs },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...typography.subtitle, color: semantic.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: semantic.textSecondary, textAlign: 'center' },
});
