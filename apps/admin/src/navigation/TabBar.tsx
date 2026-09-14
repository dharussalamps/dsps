import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/Icon';
import { colors, radius, semantic, spacing } from '@/theme/tokens';

/** One outline/filled icon pair per route in TabParamList — keep in sync with TabsNavigator. */
const ICONS: Record<string, { outline: IconName; filled: IconName }> = {
  Home: { outline: 'home-outline', filled: 'home' },
  StudentSearch: { outline: 'school-outline', filled: 'school' },
  AttendanceBoard: { outline: 'checkmark-circle-outline', filled: 'checkmark-circle' },
  Announcements: { outline: 'megaphone-outline', filled: 'megaphone' },
  StaffTab: { outline: 'people-outline', filled: 'people' },
  More: { outline: 'ellipsis-horizontal-circle-outline', filled: 'ellipsis-horizontal-circle' },
};

function TabButton({
  focused,
  label,
  icon,
  badge,
  onPress,
}: {
  focused: boolean;
  label: string;
  icon: { outline: IconName; filled: IconName };
  badge?: number | string;
  onPress: () => void;
}) {
  const [anim] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 10,
    }).start();
  }, [focused, anim]);

  const bubbleScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const lift = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const labelOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tab}
      hitSlop={6}
    >
      <Animated.View style={[styles.iconSlot, { transform: [{ translateY: lift }] }]}>
        <Animated.View style={[styles.bubble, { opacity: anim, transform: [{ scale: bubbleScale }] }]} />
        <Icon name={focused ? icon.filled : icon.outline} size={18} color={focused ? colors.white : colors.ink300} />
        {badge != null && badge !== 0 && badge !== '' ? (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel} numberOfLines={1}>
              {typeof badge === 'number' && badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text
        style={[styles.label, focused && styles.labelFocused, { opacity: labelOpacity }]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

/**
 * Floating-bubble bottom nav: the active tab's icon rises off the bar into
 * a filled circle, replacing the plain text/underline default. Built from
 * core Animated + Pressable plus @expo/vector-icons for flat outline/filled
 * icon pairs — no other icon or gradient library is installed in this app.
 */
export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = typeof options.title === 'string' ? options.title : route.name;
        const focused = state.index === index;
        const icon = ICONS[route.name] ?? { outline: 'ellipse-outline', filled: 'ellipse' };

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabButton
            key={route.key}
            focused={focused}
            label={label}
            icon={icon}
            badge={options.tabBarBadge}
            onPress={onPress}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: semantic.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    shadowColor: colors.ink900,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 2, minHeight: 44 },
  iconSlot: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: semantic.primary,
    shadowColor: semantic.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: { fontSize: 11, fontWeight: '600', color: colors.ink300 },
  labelFocused: { color: semantic.primary, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: semantic.surface,
  },
  badgeLabel: { fontSize: 9, fontWeight: '700', color: colors.white },
});
