import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { colors, minTapTarget, radius } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Defaults to white — these sit on a Hero's colored band. */
  color?: string;
  size?: number;
};

/** Bare icon action for a ScreenHeader's top-right slot — same flat, no-chrome
 * treatment as the header's own bell/back/menu buttons, so a screen action
 * (Add, Edit, Export…) reads as part of the header instead of a button glued on top. */
export function HeaderIconButton({ icon, accessibilityLabel, onPress, loading, disabled, color = colors.white, size = 22 }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      hitSlop={8}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.btn, pressed && !isDisabled && styles.pressed, isDisabled && styles.disabled]}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : <Icon name={icon} size={size} color={color} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: minTapTarget, height: minTapTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  pressed: { backgroundColor: 'rgba(255,255,255,0.16)' },
  disabled: { opacity: 0.4 },
});
