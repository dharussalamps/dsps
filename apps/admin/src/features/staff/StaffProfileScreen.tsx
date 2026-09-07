import { useRoute, type RouteProp } from '@react-navigation/native';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Card, EmptyState, Screen, ScreenHeader, StatusPill } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { semantic, spacing, typography } from '@/theme/tokens';
import { ResponsibilitiesSection } from './ResponsibilitiesSection';
import { useStaffProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StaffProfile'>;

// Attendance/leave history for an arbitrary staff member (as opposed to
// one's own, via Home's check-in card and MyLeave) doesn't have a screen
// yet — section 10 gates it on staff.view_full but doesn't name a route.
const upcomingSections = [
  { label: 'Attendance history', buildTask: null as number | null },
  { label: 'Leave history', buildTask: null as number | null },
];

export function StaffProfileScreen() {
  const { params } = useRoute<Route>();
  const profile = useStaffProfile(params.staffId);

  if (profile.isLoading) {
    return (
      <Screen>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!profile.data) {
    return (
      <Screen>
        <EmptyState title="Staff member not found" message="They may be outside what you have access to view." />
      </Screen>
    );
  }

  const s = profile.data;

  return (
    <Screen>
      <ScreenHeader title={s.fullName} subtitle={s.staffNo}>
        {s.status !== 'active' ? <StatusPill label={s.status} tone="neutral" /> : null}
      </ScreenHeader>

      <Card>
        <Button label={s.phone} variant="outline" onPress={() => Linking.openURL(`tel:${s.phone}`)} />
        {s.email ? (
          <Button label={s.email} variant="ghost" size="sm" onPress={() => Linking.openURL(`mailto:${s.email}`)} />
        ) : null}
      </Card>

      <ResponsibilitiesSection staffId={s.id} />

      <Card>
        <Text style={{ ...typography.captionStrong, color: semantic.textSecondary }}>
          MORE ABOUT THIS STAFF MEMBER
        </Text>
        {upcomingSections.map((section) => (
          <View
            key={section.label}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}
          >
            <Text style={{ ...typography.body, color: semantic.textPrimary }}>{section.label}</Text>
            <StatusPill label={section.buildTask ? `Build task ${section.buildTask}` : 'Not built yet'} tone="gold" />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
