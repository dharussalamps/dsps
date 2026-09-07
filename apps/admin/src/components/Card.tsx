import { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { elevation, radius, semantic, spacing } from '@/theme/tokens';

type Props = PropsWithChildren<{
  onPress?: () => void;
  style?: ViewStyle;
  flat?: boolean;
  testID?: string;
}>;

/** Rounded elevated surface used for every list row / summary block. */
export function Card({ children, onPress, style, flat, testID }: Props) {
  const content = (
    <View style={[styles.base, !flat && elevation.card, style]} testID={testID}>
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semantic.border,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.75 },
});
