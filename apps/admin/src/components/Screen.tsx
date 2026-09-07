import { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { semantic, spacing } from '@/theme/tokens';

type Props = PropsWithChildren<{
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  edges?: Edge[];
}>;

/** Standard screen wrapper: safe area + themed background + optional scroll. */
export function Screen({ children, scroll = true, padded = true, style, edges }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padded && styles.padded, style]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded && styles.padded, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  flex: { flex: 1 },
  padded: { padding: spacing.lg, gap: spacing.lg },
});
