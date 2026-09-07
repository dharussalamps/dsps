import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, style, ...inputProps },
  ref,
) {
  return (
    <View style={styles.group}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor={colors.ink300}
        {...inputProps}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { ...typography.captionStrong, color: semantic.textSecondary },
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
  inputError: { borderColor: colors.error },
  error: { ...typography.caption, color: colors.error },
  hint: { ...typography.caption, color: semantic.textSecondary },
});
