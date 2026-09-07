import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { semantic, spacing, typography } from '@/theme/tokens';

type Props = PropsWithChildren<{
  title: string;
  subtitle?: string;
}>;

/** Page-level heading used at the top of a Screen's scroll content. */
export function ScreenHeader({ title, subtitle, children }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  textCol: { flex: 1, gap: 2 },
  title: { ...typography.display, color: semantic.textPrimary },
  subtitle: { ...typography.body, color: semantic.textSecondary },
  action: { paddingTop: 2 },
});
