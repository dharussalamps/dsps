import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
// react-native-gesture-handler's Pressable (not RN core's) so taps negotiate correctly with
// any co-mounted gesture handler (e.g. the drawer's PanGestureHandler in TabsNavigator) — the
// core Pressable's responder can lose that negotiation and drop the first tap after a
// programmatic drawer open, requiring a second tap.
import { Pressable } from 'react-native-gesture-handler';
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
