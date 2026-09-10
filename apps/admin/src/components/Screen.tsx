import { Children, isValidElement, PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { semantic, spacing } from '@/theme/tokens';
import { Hero } from './Hero';

type Props = PropsWithChildren<{
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  edges?: Edge[];
}>;

/**
 * Standard screen wrapper: safe area + themed background + optional scroll.
 * A <Hero> child (the maroon top band) is pulled out and pinned above the
 * scroll area, so on a long screen only the content below it scrolls — the
 * header never moves.
 */
export function Screen({ children, scroll = true, padded = true, style, edges }: Props) {
  const childArray = Children.toArray(children);
  const heroIndex = childArray.findIndex((child) => isValidElement(child) && child.type === Hero);
  const hero = heroIndex >= 0 ? childArray[heroIndex] : null;
  const rest = hero ? childArray.filter((_, i) => i !== heroIndex) : childArray;

  return (
    <SafeAreaView style={styles.safe} edges={edges ?? ['top', 'left', 'right']}>
      {hero}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[padded && styles.padded, style]}
            keyboardShouldPersistTaps="handled"
          >
            {rest}
          </ScrollView>
        ) : (
          <View style={[styles.flex, padded && styles.padded, style]}>{rest}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: semantic.background },
  flex: { flex: 1 },
  padded: { padding: spacing.lg, gap: spacing.lg },
});
