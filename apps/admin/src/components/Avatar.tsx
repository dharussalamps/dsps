import { Image, ImageStyle, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, semantic } from '@/theme/tokens';

type Props = {
  name: string;
  uri?: string;
  size?: number;
  /** Use 'onPrimary' when placed over a colored (non-cream) background. */
  tone?: 'default' | 'onPrimary';
  style?: ViewStyle | ImageStyle;
  onPress?: () => void;
};

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Circular profile avatar: renders the given photo, or two-letter initials when there isn't one. */
export function Avatar({ name, uri, size = 36, tone = 'default', style, onPress }: Props) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  const content = uri ? (
    <Image source={{ uri }} style={[dimension, style as ImageStyle]} />
  ) : (
    <View
      style={[
        styles.circle,
        dimension,
        { backgroundColor: tone === 'onPrimary' ? colors.white : semantic.primaryMuted },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initialsFrom(name)}</Text>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s profile`} hitSlop={8} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700', color: semantic.primary },
});
