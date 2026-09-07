import { StyleSheet, Text, View } from 'react-native';
import { semantic, spacing, typography } from '@/theme/tokens';

type Props = {
  title: string;
  message?: string;
};

export function EmptyState({ title, message }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.xs },
  title: { ...typography.subtitle, color: semantic.textPrimary, textAlign: 'center' },
  message: { ...typography.body, color: semantic.textSecondary, textAlign: 'center' },
});
