import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SegmentedControl, StatusPill } from '@/components';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { todayIso } from '@/features/attendance/hooks';
import { useDutyRoster, useStaffDirectory, useTodayPresence } from './hooks';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'people' | 'duties';

const presenceTone: Record<string, 'success' | 'warning' | 'neutral'> = { present: 'success', late: 'warning', on_leave: 'neutral' };
const presenceLabel: Record<string, string> = { present: 'In today', late: 'Late today', on_leave: 'On leave' };
const presenceAccent: Record<string, string> = { present: colors.teal500, late: colors.gold500, on_leave: colors.ink300 };

const TABS: { key: Tab; label: string; icon: 'people-outline' | 'ribbon-outline' }[] = [
  { key: 'people', label: 'By person', icon: 'people-outline' },
  { key: 'duties', label: 'By duty', icon: 'ribbon-outline' },
];

export function StaffDirectoryScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('people');
  const staff = useStaffDirectory(query);
  const duties = useDutyRoster();
  // FR-STF-03: "the directory indicates each colleague's presence for the current day."
  const presence = useTodayPresence(todayIso());

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="briefcase-outline" bottomIcon="people-outline" />
        <ScreenHeader title="Staff directory" tone="onPrimary" back={navigation.canGoBack()} />

        <SegmentedControl value={tab} onChange={setTab} options={TABS} />
      </Hero>

      {tab === 'people' ? (
        <View style={styles.searchCard}>
          <Icon name="search-outline" size={18} color={semantic.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or staff number"
            placeholderTextColor={colors.ink300}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <Icon name="close-circle" size={18} color={colors.ink300} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ flex: 1, padding: spacing.lg, paddingTop: tab === 'people' ? spacing.sm : spacing.lg }}>
        {tab === 'people' ? (
          staff.isLoading ? (
            <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <FlatList
              data={staff.data ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
              ListEmptyComponent={<EmptyState title="No staff found" message="Try a different name or staff number." />}
              renderItem={({ item }) => {
                const presenceStatus = presence.data?.[item.id];
                const accent =
                  item.status !== 'active'
                    ? colors.ink300
                    : presenceStatus
                      ? (presenceAccent[presenceStatus] ?? colors.cream200)
                      : colors.cream200;
                return (
                  <Card onPress={() => navigation.navigate('StaffProfile', { staffId: item.id })} style={styles.staffCard}>
                    <View style={[styles.accentBar, { backgroundColor: accent }]} />
                    <View style={styles.staffRow}>
                      <Avatar name={item.fullName} size={36} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>
                          {item.fullName}
                        </Text>
                        <View style={styles.subRow}>
                          <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{item.staffNo}</Text>
                          {item.status !== 'active' ? <StatusPill label={item.status} tone="neutral" /> : null}
                          {presenceStatus ? (
                            <StatusPill label={presenceLabel[presenceStatus] ?? presenceStatus} tone={presenceTone[presenceStatus] ?? 'neutral'} />
                          ) : null}
                        </View>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Call ${item.fullName}`}
                        hitSlop={8}
                        onPress={() => Linking.openURL(`tel:${item.phone}`)}
                        style={styles.callBtn}
                      >
                        <Icon name="call" size={16} color={semantic.primary} />
                      </Pressable>
                    </View>
                  </Card>
                );
              }}
            />
          )
        ) : duties.isLoading ? (
          <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={duties.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
            ListEmptyComponent={<EmptyState title="No duties assigned" message="Responsibilities given to staff will appear here." />}
            renderItem={({ item }) => (
              <Card onPress={() => navigation.navigate('StaffProfile', { staffId: item.staffId })} style={styles.dutyCard}>
                <View style={styles.dutyIcon}>
                  <Icon name="ribbon" size={15} color={colors.gold900} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
                    {item.staffName}
                    {item.scheduleNote ? ` · ${item.scheduleNote}` : ''}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={semantic.textSecondary} />
              </Card>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    minHeight: minTapTarget,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...elevation.raised,
  },
  searchInput: { flex: 1, ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.sm },
  staffCard: { padding: 0, overflow: 'hidden' },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingLeft: spacing.sm + 4 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  callBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dutyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  dutyIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.gold100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
