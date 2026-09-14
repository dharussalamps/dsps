import { Pressable, StyleSheet } from 'react-native';
import { elevation, radius, semantic, spacing } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';

type Props = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  /** Distance from the screen's bottom edge — raise it when a tab bar sits below the content. */
  bottom?: number;
};

/** Big circular primary-color action, pinned to the bottom-right of the screen — for the one
 * action a list screen is built around (e.g. "Add event"), instead of a small header icon. */
export function FloatingActionButton({ icon, accessibilityLabel, onPress, bottom = spacing.xl }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.pressed]}
    >
      <Icon name={icon} size={28} color={semantic.textOnPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: semantic.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.raised,
  },
  pressed: { backgroundColor: semantic.primaryPressed },
});
