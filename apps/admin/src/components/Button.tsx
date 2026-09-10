import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** Flat icon shown alongside the label — e.g. a checkmark for a toggled-on state. */
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  /** Defaults to `label` — set this when label is empty (icon-only buttons). */
  accessibilityLabel?: string;
  /** Overrides the variant's default text/icon color — e.g. white for a button placed on a colored background. */
  textColor?: string;
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
  icon,
  iconPosition = 'left',
  accessibilityLabel,
  textColor,
  style,
  testID,
}: Props) {
  const isDisabled = disabled || loading;
  const iconSize = size === 'sm' ? 15 : 17;
  const resolvedTextColor = textColor ?? variantStyles[variant].text.color;
  const iconEl = icon ? <Icon name={icon} size={iconSize} color={resolvedTextColor} /> : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
        <ActivityIndicator color={resolvedTextColor} />
      ) : (
        <>
          {iconPosition === 'left' ? iconEl : null}
          {label ? (
            <Text
              style={[
                styles.label,
                variantStyles[variant].text,
                textColor ? { color: textColor } : null,
                size === 'sm' && styles.labelSm,
              ]}
            >
              {label}
            </Text>
          ) : null}
          {iconPosition === 'right' ? iconEl : null}
        </>
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
    gap: spacing.xs,
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
