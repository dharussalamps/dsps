import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { Icon } from './Icon';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  /** Shows a clear (x) button inside the field, e.g. for a search box — only rendered while `value` is non-empty. */
  onClear?: () => void;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, style, onClear, value, ...inputProps },
  ref,
) {
  const showClear = !!onClear && !!value;
  return (
    <View style={styles.group}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        <TextInput
          ref={ref}
          value={value}
          style={[styles.input, showClear && styles.inputWithClear, error && styles.inputError, style]}
          placeholderTextColor={colors.ink300}
          {...inputProps}
        />
        {showClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear"
            hitSlop={8}
            onPress={onClear}
            style={styles.clearButton}
          >
            <Icon name="close-circle" size={18} color={colors.ink300} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { ...typography.captionStrong, color: semantic.textSecondary },
  inputWrap: { justifyContent: 'center' },
  input: {
    minHeight: minTapTarget,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: semantic.border,
    backgroundColor: semantic.surface,
    paddingHorizontal: spacing.md,
    color: semantic.textPrimary,
    fontSize: typography.body.fontSize,
  },
  inputWithClear: { paddingRight: spacing.xl },
  inputError: { borderColor: colors.error },
  clearButton: { position: 'absolute', right: spacing.sm, padding: spacing.xs },
  error: { ...typography.caption, color: colors.error },
  hint: { ...typography.caption, color: semantic.textSecondary },
});
