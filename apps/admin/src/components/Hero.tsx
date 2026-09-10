import { PropsWithChildren } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, semantic, spacing } from '@/theme/tokens';

type Props = PropsWithChildren<{ style?: ViewStyle }>;

/**
 * Colored, rounded-bottom band anchoring the top of every screen — carries
 * the ScreenHeader plus any contextual controls (search, tabs, stats) so the
 * whole app reads as one themed surface instead of a plain native title bar.
 * Pair with `<Screen padded={false} edges={['left', 'right']}>` so this band
 * paints under the status bar instead of stopping at the safe area.
 */
export function Hero({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.hero, { paddingTop: insets.top + spacing.md }, style]}>{children}</View>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: semantic.primary,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
});
