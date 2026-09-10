import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { semantic } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/** Flat vector icon used everywhere in place of emoji glyphs. */
export function Icon({ name, size = 20, color = semantic.textPrimary, style }: Props) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
