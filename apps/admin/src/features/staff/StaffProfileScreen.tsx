import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInMonths, differenceInYears, format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Alert, ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, EmptyState, Hero, HeroDoodle, Icon, type IconName, Screen, SectionHeader, SegmentedControl, StatusPill, TextField } from '@/components';
import { useCanManageStaff } from '@/features/accounts/hooks';
import { fetchMyLeaveRequests, type LeaveRequestRow } from '@/features/leave/api';
import { useMyLeaveBalances } from '@/features/leave/hooks';
import { leaveTypeIcon, LeaveBalanceCard, LeaveTrendCard, statusAccentColor, statusTone } from '@/features/leave/LeaveDisplay';
import { useCurrentYearTerms } from '@/features/calendar/hooks';
import { useConfirmDiscardOnLeave } from '@/hooks/useConfirmDiscardOnLeave';
import type { RootStackParamList } from '@/navigation/types';
import { colors, radius, semantic, spacing, typography } from '@/theme/tokens';
import { updateStaffContact } from './api';
import { ResponsibilitiesSection } from './ResponsibilitiesSection';
import { useStaffAttendanceSummary, useStaffProfile } from './hooks';

type Route = RouteProp<RootStackParamList, 'StaffProfile'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'overview' | 'attendance' | 'leave';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'person-outline' },
  { key: 'attendance', label: 'Attendance', icon: 'calendar-outline' },
  { key: 'leave', label: 'Leave', icon: 'airplane-outline' },
];

function yearsOfServiceLabel(joinedOn: string | null): string | null {
  if (!joinedOn) return null;
  const start = parseISO(joinedOn);
  const years = differenceInYears(new Date(), start);
  if (years >= 1) return `${years} ${years === 1 ? 'yr' : 'yrs'} of service`;
  const months = differenceInMonths(new Date(), start);
  if (months >= 1) return `${months} ${months === 1 ? 'mo' : 'mos'} of service`;
  return 'Joined this month';
}

function rateColor(rate: number): string {
  return rate >= 90 ? colors.success : rate >= 75 ? colors.warning : colors.error;
}

/**
 * FR-STF-05: "a staff profile shows attendance summary, responsibilities
 * and leave taken, subject to the viewer's permissions." Attendance summary
 * and leave history previously had no query or UI at all — RLS
 * (can_view_staff_attendance / can_view_staff_leave) already governs who
 * this returns anything for, so an unauthorized viewer simply sees these
 * sections render nothing (FR-STF-06), the same pattern used everywhere
 * else in the app.
 */
export function StaffProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const queryClient = useQueryClient();
  const canManageStaff = useCanManageStaff();
  const [tab, setTab] = useState<Tab>('overview');
  const profile = useStaffProfile(params.staffId);
  const terms = useCurrentYearTerms();
  const termStart = terms.data?.[0]?.startsOn;
  const attendance = useStaffAttendanceSummary(params.staffId, termStart ?? '1970-01-01');
  const leave = useQuery({
    queryKey: ['leave', 'staff-history', params.staffId],
    queryFn: () => fetchMyLeaveRequests(params.staffId),
  });
  const leaveBalances = useMyLeaveBalances(params.staffId);
  const pendingLeaveRequests = (leave.data ?? []).filter((r) => r.status === 'pending');
  const takenLeaveRequests = (leave.data ?? []).filter((r) => r.status === 'approved');
  const [responsibilitiesDirty, setResponsibilitiesDirty] = useState(false);

  const [editingContact, setEditingContact] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [contactSaving, setContactSaving] = useState(false);

  const s = profile.data;
  const contactDirty = editingContact && !!s && (phone !== s.phone || email !== (s.email ?? '') || address !== (s.address ?? ''));

  useConfirmDiscardOnLeave(responsibilitiesDirty || contactDirty);

  function openEditContact() {
    if (!s) return;
    setPhone(s.phone);
    setEmail(s.email ?? '');
    setAddress(s.address ?? '');
    setEditingContact(true);
  }

  async function saveContact() {
    if (!s || !phone.trim()) return;
    setContactSaving(true);
    try {
      await updateStaffContact(s.id, { phone: phone.trim(), email: email.trim() || undefined, address: address.trim() || undefined });
      setEditingContact(false);
      await queryClient.invalidateQueries({ queryKey: ['staff', 'profile', s.id] });
      await queryClient.invalidateQueries({ queryKey: ['staff', 'list'] });
    } catch (err) {
      Alert.alert('Could not save contact details', err instanceof Error ? err.message : 'You may not have permission to do this.');
    } finally {
      setContactSaving(false);
    }
  }

  if (profile.isLoading) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="briefcase-outline" bottomIcon="people-outline" />
          <View style={styles.profileRow}>
            {navigation.canGoBack() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Icon name="chevron-back" size={26} color={colors.white} />
              </Pressable>
            ) : null}
            <Text style={styles.heroName}>Staff profile</Text>
          </View>
        </Hero>
        <ActivityIndicator color={semantic.primary} style={{ marginTop: spacing.xl }} />
      </Screen>
    );
  }

  if (!s) {
    return (
      <Screen padded={false} edges={['left', 'right']}>
        <Hero style={{ overflow: 'hidden' }}>
          <HeroDoodle topIcon="briefcase-outline" bottomIcon="people-outline" />
          <View style={styles.profileRow}>
            {navigation.canGoBack() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Icon name="chevron-back" size={26} color={colors.white} />
              </Pressable>
            ) : null}
            <Text style={styles.heroName}>Staff profile</Text>
          </View>
        </Hero>
        <View style={{ padding: spacing.lg }}>
          <EmptyState title="Staff member not found" message="They may be outside what you have access to view." />
        </View>
      </Screen>
    );
  }

  const presentPct =
    attendance.data && attendance.data.totalDays > 0 ? Math.round((attendance.data.presentDays / attendance.data.totalDays) * 100) : null;
  const yearsLabel = yearsOfServiceLabel(s.joinedOn);

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <Hero style={{ overflow: 'hidden' }}>
        <HeroDoodle topIcon="briefcase-outline" bottomIcon="people-outline" />
        <View style={styles.profileRow}>
          {navigation.canGoBack() ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Icon name="chevron-back" size={26} color={colors.white} />
            </Pressable>
          ) : null}
          <Avatar name={s.fullName} size={48} tone="onPrimary" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.heroName} numberOfLines={1}>
              {s.fullName}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {s.staffNo}
            </Text>
          </View>
          {s.status !== 'active' ? <StatusPill label={s.status} tone="neutral" /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${s.fullName}`}
            hitSlop={8}
            onPress={() => Linking.openURL(`tel:${s.phone}`)}
            style={styles.callBtn}
          >
            <Icon name="call" size={20} color={colors.white} />
          </Pressable>
        </View>

        <SegmentedControl value={tab} onChange={setTab} options={TABS} />
      </Hero>

      <View style={{ padding: spacing.lg, gap: spacing.lg }}>
        {tab === 'overview' ? (
          <>
            <Card>
              <SectionHeader
                icon="call-outline"
                label="CONTACT"
                accessory={
                  canManageStaff ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={editingContact ? 'Cancel editing contact details' : 'Edit contact details'}
                      hitSlop={8}
                      onPress={() => (editingContact ? setEditingContact(false) : openEditContact())}
                      style={[styles.editChip, editingContact && styles.editChipActive]}
                    >
                      <Icon name={editingContact ? 'close' : 'create-outline'} size={15} color={editingContact ? colors.error : semantic.primary} />
                    </Pressable>
                  ) : undefined
                }
              />

              {editingContact ? (
                <View style={styles.editPanel}>
                  <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <TextField label="Email (optional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                  <TextField label="Address (optional)" value={address} onChangeText={setAddress} multiline />
                  <Button label="Save changes" icon="checkmark" size="sm" onPress={() => void saveContact()} loading={contactSaving} disabled={!phone.trim()} />
                </View>
              ) : (
                <View style={{ gap: spacing.md }}>
                  <InfoTile icon="call-outline" label="Phone" value={s.phone} />
                  <InfoTile icon="mail-outline" label="Email" value={s.email ?? '—'} />
                  <InfoTile icon="location-outline" label="Address" value={s.address ?? '—'} />
                </View>
              )}
            </Card>

            <ResponsibilitiesSection staffId={s.id} onDirtyChange={setResponsibilitiesDirty} />
          </>
        ) : null}

        {tab === 'attendance' ? (
          attendance.data && attendance.data.totalDays > 0 ? (
            <Card>
              <SectionHeader icon="bar-chart-outline" label="ATTENDANCE ANALYSIS" />

              <View style={styles.statBlock}>
                <View style={{ gap: 2 }}>
                  <Text style={styles.statBlockLabel}>Attendance rate</Text>
                  <Text style={styles.statBlockValue}>{presentPct ?? 0}%</Text>
                  <Text style={styles.statBlockSub}>
                    {attendance.data.presentDays} of {attendance.data.totalDays} {attendance.data.totalDays === 1 ? 'day' : 'days'} this term
                  </Text>
                </View>
                {yearsLabel ? (
                  <View style={styles.statBlockBadge}>
                    <Icon name="ribbon" size={14} color={colors.white} />
                    <Text style={styles.statBlockBadgeText}>{yearsLabel}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.metricsRow}>
                <Metric
                  label="Present"
                  value={attendance.data.presentDays}
                  pct={Math.round((attendance.data.presentDays / attendance.data.totalDays) * 100)}
                  icon="checkmark-circle"
                  color={colors.success}
                />
                <Metric
                  label="Late"
                  value={attendance.data.lateDays}
                  pct={Math.round((attendance.data.lateDays / attendance.data.totalDays) * 100)}
                  icon="time"
                  color={colors.warning}
                />
                <Metric
                  label="Leave"
                  value={attendance.data.leaveDays}
                  pct={Math.round((attendance.data.leaveDays / attendance.data.totalDays) * 100)}
                  icon="airplane"
                  color={colors.info}
                />
                <Metric
                  label="Absent"
                  value={attendance.data.absentDays}
                  pct={Math.round((attendance.data.absentDays / attendance.data.totalDays) * 100)}
                  icon="close-circle"
                  color={colors.error}
                />
              </View>

              {attendance.data.months.length > 1 ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  <Text style={styles.trendLabel}>MONTHLY TREND</Text>
                  <View style={styles.chartRow}>
                    {attendance.data.months.map((m) => {
                      const rate = m.total > 0 ? Math.round(((m.presentDays + m.lateDays) / m.total) * 100) : 0;
                      return (
                        <View key={m.month} style={styles.chartCol}>
                          <View style={styles.chartTrack}>
                            <View style={[styles.chartFill, { height: `${Math.max(6, rate)}%`, backgroundColor: rateColor(rate) }]} />
                          </View>
                          <Text style={styles.chartValue}>{rate}%</Text>
                          <Text style={styles.chartLabel} numberOfLines={1}>
                            {format(parseISO(`${m.month}-01`), 'MMM')}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </Card>
          ) : (
            <EmptyState title="No attendance recorded" message="Attendance for this term will appear here once marked." />
          )
        ) : null}

        {tab === 'leave' ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <SectionHeader icon="trending-up-outline" label="LEAVE ANALYSIS" />
              <LeaveTrendCard requests={leave.data ?? []} />
            </View>

            <View style={{ gap: spacing.sm }}>
              <SectionHeader icon="wallet-outline" label="LEAVE BALANCE" />
              {leaveBalances.data && leaveBalances.data.length > 0 ? (
                leaveBalances.data.map((b) => <LeaveBalanceCard key={b.leaveTypeId} balance={b} />)
              ) : (
                <EmptyState title="No balances allocated" message="Balances set in Leave Allocation will appear here." />
              )}
            </View>

            <View style={{ gap: spacing.sm }}>
              <SectionHeader icon="hourglass-outline" label="PENDING REQUESTS" />
              {pendingLeaveRequests.length > 0 ? (
                pendingLeaveRequests.map((r) => (
                  <PendingLeaveRow key={r.id} request={r} onPress={() => navigation.navigate('LeaveRequestDetail', { requestId: r.id })} />
                ))
              ) : (
                <EmptyState title="No pending requests" />
              )}
            </View>

            {takenLeaveRequests.length > 0 ? (
              <Card>
                <SectionHeader icon="airplane-outline" label="LEAVE TAKEN" />
                {takenLeaveRequests.slice(0, 10).map((l, i) => (
                  <View key={l.id} style={[styles.leaveRow, i > 0 && styles.leaveRowDivider]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ ...typography.body, color: semantic.textPrimary }}>{l.leaveTypeName}</Text>
                      <Text style={{ ...typography.caption, color: semantic.textSecondary }}>
                        {l.startsOn} → {l.endsOn} · {l.dayCount} {l.dayCount === 1 ? 'day' : 'days'}
                      </Text>
                    </View>
                    <StatusPill label={l.status} tone={statusTone[l.status]} />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function InfoTile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoIconChip}>
        <Icon name={icon} size={15} color={semantic.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }}>{label}</Text>
        <Text style={{ ...typography.caption, color: semantic.textPrimary }} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Metric({ label, value, pct, icon, color }: { label: string; value: number; pct: number; icon: IconName; color: string }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIconChip, { backgroundColor: `${color}1A` }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricPct}>{pct}%</Text>
    </View>
  );
}

/** A pending request is tappable straight through to LeaveRequestDetail — whoever can act on it (principal/administrator) gets Approve/Reject there; RLS is the real gate, so tapping through is safe for anyone, same pattern as LeaveRequestsScreen. */
function PendingLeaveRow({ request, onPress }: { request: LeaveRequestRow; onPress: () => void }) {
  return (
    <Card onPress={onPress} flat style={styles.pendingCard}>
      <View style={[styles.pendingAccent, { backgroundColor: statusAccentColor.pending }]} />
      <View style={styles.historyIconWrap}>
        <Icon name={leaveTypeIcon(request.leaveTypeKey)} size={14} color={semantic.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ ...typography.bodyStrong, color: semantic.textPrimary }} numberOfLines={1}>
          {request.leaveTypeName} · {request.dayCount}d
        </Text>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
          {request.startsOn} → {request.endsOn}
        </Text>
        <Text style={{ ...typography.caption, color: semantic.textSecondary }} numberOfLines={1}>
          {request.reason}
        </Text>
        {request.requestedBy !== request.staffId ? (
          <Text style={{ ...typography.caption, color: semantic.textSecondary, fontStyle: 'italic' }} numberOfLines={1}>
            Requested by {request.requestedByName}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} color={semantic.textSecondary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { ...typography.title, color: colors.white },
  heroMeta: { ...typography.body, color: colors.cream100 },
  editChip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editChipActive: { backgroundColor: colors.errorBg },
  editPanel: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: semantic.border,
  },
  infoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoIconChip: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: semantic.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  statBlockLabel: { ...typography.caption, color: colors.cream100 },
  statBlockValue: { ...typography.display, color: colors.white },
  statBlockSub: { ...typography.caption, color: colors.cream100 },
  statBlockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statBlockBadgeText: { ...typography.captionStrong, color: colors.white },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  metric: { alignItems: 'center', gap: 4, flex: 1 },
  metricIconChip: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  metricValue: { ...typography.subtitle, color: semantic.textPrimary },
  metricLabel: { ...typography.caption, color: semantic.textSecondary },
  metricPct: { ...typography.caption, color: semantic.textSecondary, fontWeight: '600' },
  trendLabel: { ...typography.captionStrong, color: semantic.textSecondary, letterSpacing: 0.4 },
  chartRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xs },
  chartCol: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  chartTrack: {
    width: 20,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: semantic.surfaceAlt,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartFill: { width: '100%', borderRadius: radius.sm },
  chartValue: { ...typography.captionStrong, color: semantic.textPrimary },
  chartLabel: { ...typography.caption, color: semantic.textSecondary },
  leaveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm },
  leaveRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
  pendingCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, overflow: 'hidden', padding: spacing.sm },
  pendingAccent: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill },
  historyIconWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: semantic.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
