import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  style,
  testID,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        size === 'sm' && styles.sm,
        isDisabled && styles.disabled,
        pressed && !isDisabled && variantStyles[variant].pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color as string} />
      ) : (
        <Text style={[styles.label, variantStyles[variant].text, size === 'sm' && styles.labelSm]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTapTarget,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  sm: { minHeight: 36, paddingHorizontal: spacing.md },
  label: { ...typography.bodyStrong },
  labelSm: { fontSize: 13 },
  disabled: { opacity: 0.45 },
});

const variantStyles: Record<Variant, { container: ViewStyle; pressed: ViewStyle; text: { color: string } }> = {
  primary: {
    container: { backgroundColor: semantic.primary },
    pressed: { backgroundColor: semantic.primaryPressed },
    text: { color: semantic.textOnPrimary },
  },
  secondary: {
    container: { backgroundColor: semantic.secondary },
    pressed: { backgroundColor: semantic.secondaryPressed },
    text: { color: semantic.textPrimary },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: semantic.primary },
    pressed: { backgroundColor: semantic.primaryMuted },
    text: { color: semantic.primary },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    pressed: { backgroundColor: semantic.surfaceAlt },
    text: { color: semantic.primary },
  },
  danger: {
    container: { backgroundColor: '#C22B2B' },
    pressed: { backgroundColor: '#A22222' },
    text: { color: semantic.textOnPrimary },
  },
};
