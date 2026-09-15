import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { Avatar, Card, EmptyState, Hero, HeroDoodle, Icon, Screen, ScreenHeader, SegmentedControl, StatusPill } from '@/components';
import { useIsPrincipal } from '@/features/accounts/hooks';
import { useAcademicYears } from '@/features/calendar/hooks';
import { YearChip } from '@/features/calendar/YearChip';
import type { RootStackParamList } from '@/navigation/types';
import { colors, elevation, minTapTarget, radius, semantic, spacing, typography } from '@/theme/tokens';
import { MATERNITY_PHASE_LABEL, type LeaveRequestRow } from './api';
import { useLeaveRequestsByStatus } from './hooks';
import { groupRequestsByLeaveType, leaveTypeIcon } from './LeaveDisplay';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Status = 'pending' | 'approved';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateNext() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

/**
 * Principal-only review screen (RLS's read_leave_requests already limits a
 * non-principal to just their own requests — this screen additionally
 * refuses to render the list at all for anyone without the 'principal'
 * role, per the principal's request). Pending and Approved are separate
 * tabs, each further split into one section per leave type (Casual,
 * Medical, Duty, ... — see groupRequestsByLeaveType), filterable to one
 * academic year and searchable by staff name.
 */
export function LeaveRequestsScreen() {
  const navigation = useNavigation<Nav>();
  const isPrincipal = useIsPrincipal();

  const [status, setStatus] = useState<Status>('pending');
  const [pickedYearId, setPickedYearId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const years = useAcademicYears();
  const yearId = pickedYearId ?? years.data?.find((y) => y.isCurrent)?.id ?? years.data?.[0]?.id;
  const year = years.data?.find((y) => y.id === yearId);
  const yearRange = year ? { startsOn: year.startsOn, endsOn: year.endsOn } : undefined;

  // Both statuses are fetched together (not just the active tab) so the
  // hero's stats strip can show live Pending/Approved/Away-today counts no
  // matter which tab is currently open.
  const pending = useLeaveRequestsByStatus('pending', yearRange);
  const approved = useLeaveRequestsByStatus('approved', yearRange);
  const active = status === 'pending' ? pending : approved;

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const onLeaveTodayCount = useMemo(
    () => (approved.data ?? []).filter((r) => r.startsOn <= todayIso && r.endsOn >= todayIso).length,
    [approved.data, todayIso],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const data = active.data ?? [];
    if (!q) return data;
    return data.filter((r) => r.staffName.toLowerCase().includes(q));
  }, [active.data, search]);

  const sections = useMemo(() => groupRequestsByLeaveType(filtered), [filtered]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([pending.refetch(), approved.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (!isPrincipal) {
    return (
      <Screen scroll={false} padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
          <ScreenHeader title="Leave requests" tone="onPrimary" back={navigation.canGoBack()} />
        </Hero>
        <EmptyState icon="lock-closed-outline" title="Principals only" message="This screen is restricted to the principal." />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="airplane-outline" bottomIcon="calendar-outline" />
        <ScreenHeader title="Leave requests" tone="onPrimary" back={navigation.canGoBack()} />

        <View style={styles.statsRow}>
          <HeroStat value={pending.data?.length ?? 0} label="Pending" />
          <View style={styles.statDivider} />
          <HeroStat value={approved.data?.length ?? 0} label="Approved" />
          <View style={styles.statDivider} />
          <HeroStat value={onLeaveTodayCount} label="Away today" />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
          {(years.data ?? []).map((y) => (
            <YearChip
              key={y.id}
              year={y}
              active={y.id === yearId}
              onPress={() => {
                animateNext();
                setPickedYearId(y.id);
              }}
            />
          ))}
        </ScrollView>

        <View style={{ marginTop: spacing.sm }}>
          <SegmentedControl
            value={status}
            onChange={(next) => {
              animateNext();
              setStatus(next);
            }}
            options={[
              { key: 'pending', label: 'Pending', icon: 'time-outline' },
              { key: 'approved', label: 'Approved', icon: 'checkmark-done-outline' },
            ]}
          />
        </View>
      </Hero>

      <View style={styles.searchCard}>
        <Icon name="search-outline" size={18} color={semantic.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search staff by name"
          placeholderTextColor={colors.ink300}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch('')}>
            <Icon name="close-circle" size={18} color={colors.ink300} />
          </Pressable>
        ) : null}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={semantic.primary} colors={[semantic.primary]} />}
        ListEmptyComponent={
          active.isLoading ? null : (
            <EmptyState
              icon={search.trim() ? 'search-outline' : status === 'pending' ? 'time-outline' : 'checkmark-done-outline'}
              title={`No ${status} requests`}
              message={search.trim() ? `No match for "${search.trim()}".` : `Nothing to show for ${year?.label ?? 'this year'} yet.`}
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBadge}>
              <Icon name={leaveTypeIcon(section.key)} size={14} color={semantic.primary} />
            </View>
            <Text style={styles.sectionHeaderLabel}>{section.title}</Text>
            <StatusPill label={String(section.data.length)} tone="info" />
          </View>
        )}
        renderItem={({ item }) => <RequestCard item={item} onPress={() => navigation.navigate('LeaveRequestDetail', { requestId: item.id })} />}
      />
    </Screen>
  );
}

/**
 * One leave request row — an elevated, tappable card. The left accent bar
 * and the bottom pill both pick up the same gold tone when a principal or
 * administrator filed this on the staff member's behalf, so that fact reads
 * at a glance without needing to read the pill text.
 */
function RequestCard({ item, onPress }: { item: LeaveRequestRow; onPress: () => void }) {
  const onBehalf = item.requestedBy !== item.staffId;
  const isHalfDay = item.dayCount === 0.5;
  const phaseLabel = item.maternityPhase ? MATERNITY_PHASE_LABEL[item.maternityPhase] : null;

  return (
    <Card onPress={onPress} style={styles.requestCard}>
      <View style={[styles.requestAccent, onBehalf && styles.requestAccentBehalf]} />
      <View style={styles.requestRow}>
        <Avatar name={item.staffName} size={42} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.requestTopRow}>
            <Text style={styles.requestName} numberOfLines={1}>
              {item.staffName}
            </Text>
            <View style={styles.dayBadge}>
              <Icon name="calendar-clear-outline" size={11} color={semantic.primary} />
              <Text style={styles.dayBadgeText}>{isHalfDay ? '½ day' : `${item.dayCount}d`}</Text>
            </View>
          </View>

          <View style={styles.requestMetaRow}>
            <Icon name="calendar-outline" size={12} color={semantic.textSecondary} />
            <Text style={styles.requestMetaText} numberOfLines={1}>
              {item.startsOn} → {item.endsOn}
            </Text>
            {phaseLabel ? <StatusPill label={phaseLabel} tone="info" /> : null}
          </View>

          <Text style={styles.requestReason} numberOfLines={1}>
            {item.reason}
          </Text>

          <StatusPill label={onBehalf ? `Filed by ${item.requestedByName}` : 'Self-requested'} tone={onBehalf ? 'gold' : 'neutral'} />
        </View>
        <Icon name="chevron-forward" size={16} color={colors.ink300} />
      </View>
    </Card>
  );
}

function HeroStat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { ...typography.subtitle, color: colors.white },
  heroStatLabel: { ...typography.caption, color: colors.cream100 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)' },

  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.xs,
    minHeight: minTapTarget,
    backgroundColor: semantic.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    ...elevation.raised,
  },
  searchInput: { flex: 1, ...typography.body, color: semantic.textPrimary, paddingVertical: spacing.sm },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  sectionIconBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderLabel: { ...typography.captionStrong, color: semantic.textPrimary, flex: 1 },

  requestCard: { padding: 0, overflow: 'hidden' },
  requestAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.cream200 },
  requestAccentBehalf: { backgroundColor: colors.gold500 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, paddingLeft: spacing.md + 4 },
  requestTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  requestName: { ...typography.bodyStrong, color: semantic.textPrimary, flex: 1 },
  requestMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  requestMetaText: { ...typography.caption, color: semantic.textSecondary, flexShrink: 1 },
  requestReason: { ...typography.caption, color: semantic.textSecondary },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
  },
  dayBadgeText: { ...typography.captionStrong, color: semantic.primary },
});
