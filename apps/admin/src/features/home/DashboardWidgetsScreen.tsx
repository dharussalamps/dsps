import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { Card, Hero, HeroDoodle, Screen, ScreenHeader, SectionHeader, ToggleRow, type IconName, type WidgetTint } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, semantic, spacing } from '@/theme/tokens';
import { WIDGET_REGISTRY, type WidgetCategory } from './widgets';
import { useSetWidgetEnabled, useWidgetPrefs } from './widgetPrefs';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORY_ORDER: WidgetCategory[] = ['core', 'academic', 'attendance', 'calendar', 'activity'];

const CATEGORY_META: Record<WidgetCategory, { label: string; icon: IconName; tint: WidgetTint }> = {
  core: { label: 'ALWAYS HANDY', icon: 'flash-outline', tint: { fg: semantic.primary, bg: semantic.primaryMuted } },
  academic: { label: 'ACADEMIC & STUDENTS', icon: 'school-outline', tint: { fg: colors.gold700, bg: semantic.secondaryMuted } },
  attendance: { label: 'ATTENDANCE & STAFF', icon: 'people-outline', tint: { fg: colors.teal700, bg: 'rgba(79, 184, 176, 0.16)' } },
  calendar: { label: 'CALENDAR & EVENTS', icon: 'calendar-outline', tint: { fg: colors.info, bg: colors.infoBg } },
  activity: { label: 'ACTIVITY & UPDATES', icon: 'pulse-outline', tint: { fg: semantic.primary, bg: semantic.primaryMuted } },
};

/**
 * Lets each staff member choose which Home screen cards they see. Stored
 * per-account in staff_dashboard_prefs, so the choice follows them across
 * devices — see widgetPrefs.ts. Widgets are grouped by CATEGORY_META purely
 * for scanability here; HomeScreen itself doesn't know about categories.
 */
export function DashboardWidgetsScreen() {
  const navigation = useNavigation<Nav>();
  const { isEnabled } = useWidgetPrefs();
  const setWidgetEnabled = useSetWidgetEnabled();

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="grid-outline" bottomIcon="apps-outline" />
        <ScreenHeader
          title="Dashboard widgets"
          subtitle="Choose what shows on Home"
          tone="onPrimary"
          back={navigation.canGoBack()}
          hideBell
        />
      </Hero>

      <View style={styles.body}>
        {CATEGORY_ORDER.map((category) => {
          const widgets = WIDGET_REGISTRY.filter((w) => w.category === category);
          if (widgets.length === 0) return null;
          const meta = CATEGORY_META[category];

          return (
            <Card key={category}>
              <SectionHeader icon={meta.icon} label={meta.label} />
              {widgets.map((widget, i) => (
                <View key={widget.id} style={i > 0 ? styles.divider : undefined}>
                  <ToggleRow
                    icon={widget.icon}
                    tint={meta.tint}
                    label={widget.label}
                    description={widget.description}
                    value={isEnabled(widget.id)}
                    busy={setWidgetEnabled.isPending && setWidgetEnabled.variables?.id === widget.id}
                    onToggle={() => setWidgetEnabled.mutate({ id: widget.id, enabled: !isEnabled(widget.id) })}
                  />
                </View>
              ))}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.08)' },
});
